// Run against the Vite dev server with Playwright installed or available via NODE_PATH.
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const { chromium } = createRequire(import.meta.url)("playwright");
const browser = await chromium.launch({ headless: true, channel: process.env.BOARD_TEST_BROWSER || "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
if (process.env.BOARD_TEST_STATIC === "1") {
  const dist = resolve("dist");
  await page.route("http://board.test/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const file = resolve(dist, path === "/" ? "index.html" : `.${path}`);
    if (!file.startsWith(dist + sep)) return route.fulfill({ status: 403 });
    const types = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
    try { return route.fulfill({ body: await readFile(file), contentType: types[extname(file)] || "application/octet-stream" }); }
    catch { return route.fulfill({ status: 404 }); }
  });
}
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
const dueDate = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
let issues = [
  { id: 1, title: "Refine the workspace", description: "Bring the board, filters, and details together into a clear team workspace.", status: "TODO", priority: "HIGH", assigneeId: 7, assigneeName: "Sam Lee", dueDate, createdAt: "2026-10-01T12:00:00" },
  { id: 2, title: "Review mobile layout", description: "Check the board on small screens.", status: "IN_PROGRESS", priority: "MEDIUM", assigneeId: 8, assigneeName: "Alex Kim", dueDate: null, createdAt: "2026-10-01T12:00:00" },
  { id: 3, title: "Define priorities", description: "Give every issue a clear next step.", status: "DONE", priority: "LOW", assigneeId: null, assigneeName: null, dueDate, createdAt: "2026-10-01T12:00:00" },
];
let failMove = false;
let failSave = false;
let failLoad = false;
let failCommentSave = false;
let failActivityLoad = true;
let nextActivityId = 10;
const activityByIssue = new Map([[1, [{ id: 1, actorId: 7, actorName: "Sam Lee", field: "CREATED", oldValue: null, newValue: "Refine the workspace", createdAt: "2026-10-01T12:00:00Z" }]]]);
function recordActivity(issueId, field, oldValue, newValue) {
  if (field !== "CREATED" && oldValue === newValue) return;
  const activity = { id: nextActivityId++, actorId: 7, actorName: "Sam Lee", field, oldValue, newValue, createdAt: "2026-10-09T12:00:00Z" };
  activityByIssue.set(issueId, [activity, ...(activityByIssue.get(issueId) || [])]);
}
let commentList = [
  { id: 11, authorId: 8, authorName: "Alex Kim", body: "Ready for review.", createdAt: "2026-10-08T10:00:00Z", editedAt: null },
  { id: 12, authorId: 7, authorName: "Sam Lee", body: "I will check the layout.", createdAt: "2026-10-09T10:00:00Z", editedAt: null },
];
let nextId = 4;
const members = [{ userId: 7, name: "Sam Lee", email: "sam@example.test", role: "OWNER" }, { userId: 8, name: "Alex Kim", email: "alex@example.test", role: "MEMBER" }];
await page.route("**/api/**", async route => {
  const request = route.request(); const path = new URL(request.url()).pathname; const method = request.method();
  const reply = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
  if (path.endsWith("/csrf")) return reply({ token: "test-token" });
  if (path.endsWith("/me")) return reply({ id: 7, name: "Sam Lee", email: "sam@example.test" });
  if (path.endsWith("/activity")) {
    const issueId = Number(path.match(/issues\/(\d+)/)?.[1]);
    return reply(failActivityLoad ? {} : activityByIssue.get(issueId) || [], failActivityLoad ? 500 : 200);
  }
  if (/\/comments(?:\/\d+)?$/.test(path)) {
    if (method === "GET") return reply(commentList);
    if (failCommentSave && method !== "GET") return reply({}, 500);
    if (method === "POST") {
      const comment = { id: 13, authorId: 7, authorName: "Sam Lee", body: request.postDataJSON().body, createdAt: "2026-10-09T11:00:00Z", editedAt: null };
      commentList.push(comment); return reply(comment, 201);
    }
    const commentId = Number(path.split("/").at(-1));
    if (method === "PUT") { const comment = commentList.find(item => item.id === commentId); comment.body = request.postDataJSON().body; comment.editedAt = "2026-10-09T12:00:00Z"; return reply(comment); }
    if (method === "DELETE") { commentList = commentList.filter(item => item.id !== commentId); return route.fulfill({ status: 204 }); }
  }
  if (path.endsWith("/members")) return reply(members);
  if (path === "/api/projects") return reply([{ id: 1, name: "Product launch", description: "Build something worth sharing.", ownerId: 7, createdAt: "2026-10-01T12:00:00" }]);
  if (path.endsWith("/issues") && method === "GET") return reply(failLoad ? {} : issues, failLoad ? 500 : 200);
  if (path.endsWith("/issues") && method === "POST") {
    const payload = request.postDataJSON(); const issue = { ...payload, id: nextId++, status: "TODO", assigneeName: members.find(member => member.userId === payload.assigneeId)?.name ?? null, createdAt: "2026-10-09T12:00:00" }; issues.unshift(issue); recordActivity(issue.id, "CREATED", null, issue.title); return reply(issue, 201);
  }
  const id = Number(path.match(/issues\/(\d+)/)?.[1]); const issue = issues.find(item => item.id === id);
  if (method === "PATCH") { if (failMove) return reply({}, 500); recordActivity(id, "STATUS", issue.status, request.postDataJSON().status); Object.assign(issue, request.postDataJSON()); return reply(issue); }
  if (method === "PUT") { if (failSave) return reply({}, 500); recordActivity(id, "TITLE", issue.title, request.postDataJSON().title); Object.assign(issue, request.postDataJSON()); issue.assigneeName = members.find(member => member.userId === issue.assigneeId)?.name ?? null; return reply(issue); }
  if (method === "DELETE") { issues = issues.filter(item => item.id !== id); return route.fulfill({ status: 204 }); }
  return reply({}, 404);
});
const waitFor = async (condition) => { for (let i = 0; i < 50; i++) { if (await condition()) return; await page.waitForTimeout(100); } throw new Error("Condition did not become true"); };
try {
  await page.goto(process.env.BOARD_TEST_STATIC === "1" ? "http://board.test/" : process.env.BOARD_TEST_URL || "http://127.0.0.1:5173");
  await page.getByRole("button", { name: "Open Board" }).click();
  await page.getByRole("button", { name: /Refine the workspace/ }).waitFor();
  assert.equal(await page.locator("article").count(), 3);
  assert.equal(await page.getByText(/· Overdue/).count(), 1);
  await page.screenshot({ path: "tests/board-desktop.png", fullPage: true });

  await page.getByRole("button", { name: "Assigned to me", exact: true }).click();
  assert.equal(await page.locator("article").count(), 1);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByRole("textbox", { name: "Search issue titles" }).fill("does not exist");
  assert.equal(await page.getByText("No matching issues", { exact: true }).count(), 3);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByRole("combobox", { name: "Filter by priority" }).selectOption("LOW");
  assert.equal(await page.locator("article").count(), 1);
  await page.getByRole("button", { name: "Clear filters" }).click();

  await page.locator("article").filter({ hasText: "Refine the workspace" }).dragTo(page.getByRole("region", { name: "In progress", exact: true }));
  await waitFor(async () => (await page.getByRole("combobox", { name: "Status for Refine the workspace" }).inputValue()) === "IN_PROGRESS" && !(await page.getByRole("combobox", { name: "Status for Refine the workspace" }).isDisabled()));
  assert.equal(issues[0].status, "IN_PROGRESS");
  failMove = true;
  await page.getByRole("combobox", { name: "Status for Refine the workspace" }).selectOption("DONE");
  await page.getByRole("alert").filter({ hasText: "returned" }).waitFor();
  assert.equal(await page.getByRole("combobox", { name: "Status for Refine the workspace" }).inputValue(), "IN_PROGRESS");
  failMove = false;

  await page.getByRole("button", { name: /Refine the workspace/ }).click();
  assert.equal(await page.getByRole("dialog").isVisible(), true);
  const history = page.getByRole("region", { name: "Activity history", exact: true });
  await history.getByRole("alert").waitFor();
  failActivityLoad = false;
  await history.getByRole("button", { name: "Retry activity" }).click();
  await history.getByText(/changed the status/).waitFor();
  assert.match(await history.locator("li").first().innerText(), /changed the status/);
  assert.equal(await history.getByText("To do", { exact: true }).count(), 1);
  assert.equal(await history.getByText("In progress", { exact: true }).count(), 1);
  assert.equal(await history.getByRole("textbox").count(), 0);
  assert.equal(await history.getByRole("button").count(), 0);
  await page.getByText("Ready for review.", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Edit comment by Alex Kim" }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Delete comment by Alex Kim" }).count(), 0);
  await page.getByRole("textbox", { name: "Add a comment" }).fill("  <b>Plain text update</b>  ");
  failCommentSave = true;
  await page.getByRole("button", { name: "Post comment" }).click();
  await page.getByRole("alert").filter({ hasText: "save your comment" }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "Add a comment" }).inputValue(), "  <b>Plain text update</b>  ");
  failCommentSave = false;
  await page.getByRole("button", { name: "Post comment" }).click();
  await page.getByText("<b>Plain text update</b>", { exact: true }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "Add a comment" }).inputValue(), "");
  const addedComment = page.getByRole("article", { name: "Comment by Sam Lee", exact: true }).filter({ hasText: "<b>Plain text update</b>" });
  await addedComment.getByRole("button", { name: "Edit comment by Sam Lee" }).click();
  await page.getByRole("textbox", { name: "Edit comment", exact: true }).fill("Updated comment");
  await page.getByRole("button", { name: "Save comment", exact: true }).click();
  await page.getByText("Updated comment", { exact: true }).waitFor();
  const editedComment = page.getByRole("article", { name: "Comment by Sam Lee", exact: true }).filter({ hasText: "Updated comment" });
  assert.equal(await editedComment.getByText("· edited", { exact: true }).count(), 1);
  await editedComment.getByRole("button", { name: "Delete comment by Sam Lee" }).click();
  await editedComment.getByRole("button", { name: "Keep comment" }).click();
  await editedComment.getByRole("button", { name: "Delete comment by Sam Lee" }).click();
  await editedComment.getByRole("button", { name: "Confirm delete", exact: true }).click();
  await waitFor(async () => !(await page.getByText("Updated comment", { exact: true }).count()));
  await page.getByRole("textbox", { name: /^Title/ }).fill("Refined workspace");
  failSave = true;
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByRole("alert").filter({ hasText: "Your changes are still here" }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: /^Title/ }).inputValue(), "Refined workspace");
  failSave = false;
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByRole("button", { name: /Refined workspace/ }).waitFor();

  await page.getByRole("button", { name: "New issue", exact: true }).click();
  await page.getByRole("textbox", { name: /^Title/ }).fill("Portfolio walkthrough");
  await page.getByRole("button", { name: "Create issue", exact: true }).click();
  await page.getByRole("button", { name: /Portfolio walkthrough/ }).click();
  await page.getByRole("button", { name: "Delete issue", exact: true }).click();
  await page.getByRole("button", { name: "Keep issue" }).click();
  await page.getByRole("button", { name: "Delete issue", exact: true }).click();
  await page.getByRole("button", { name: "Yes, delete issue" }).click();
  await waitFor(async () => !(await page.getByRole("dialog").count()));
  assert.equal(issues.length, 3);

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.screenshot({ path: "tests/board-mobile.png", fullPage: true });
  await page.getByRole("button", { name: /Refined workspace/ }).click();
  await history.getByText(/changed the title/).waitFor();
  assert.match(await history.locator("li").first().innerText(), /changed the title/);
  await history.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "tests/board-activity.png" });
  await page.screenshot({ path: "tests/board-panel.png", fullPage: true });
  await page.getByText("Ready for review.", { exact: true }).waitFor();
  await page.getByRole("textbox", { name: "Add a comment" }).scrollIntoViewIfNeeded();
  const panelBounds = await page.getByRole("dialog").boundingBox();
  assert.equal(panelBounds.y, 0);
  assert.equal(panelBounds.width <= 390, true);
  await page.screenshot({ path: "tests/board-comments.png" });
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  await page.getByRole("button", { name: "All projects" }).click();
  await page.getByRole("button", { name: "Open Board" }).click();
  await page.getByRole("button", { name: /Review mobile layout/ }).click();
  await history.getByText(/No activity recorded yet/).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "All projects" }).click();
  failLoad = true;
  await page.getByRole("button", { name: "Open Board" }).click();
  await page.getByRole("alert").filter({ hasText: "load this board" }).waitFor();
  failLoad = false;
  await page.getByRole("button", { name: "Reload board" }).click();
  await page.getByRole("button", { name: /Refined workspace/ }).waitFor();
  assert.deepEqual(errors, []);
  console.log("Browser checks passed: board and comment interactions, read-only activity timeline, previous/new values, newest-first ordering, empty history, error retry, and mobile layout.");
} finally { await browser.close(); }
