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
let failActivityLoad = false;
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
let currentUserId = 7;
await page.route("**/api/**", async route => {
  const request = route.request(); const path = new URL(request.url()).pathname; const method = request.method();
  const reply = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
  if (path === "/api/notifications") return reply({ items: [], unreadCount: 0 });
  if (path.endsWith("/sprints")) return reply([]);
  if (path.endsWith("/csrf")) return reply({ token: "test-token" });
  if (path.endsWith("/me")) { const member = members.find(item => item.userId === currentUserId); return reply({ id: currentUserId, name: member.name, email: member.email }); }
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
  if (path === "/api/projects/1") return reply({ id: 1, name: "Product launch", description: "Build something worth sharing.", projectKey: "WEB", ownerId: 7, createdAt: "2026-10-01T12:00:00" });
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
issues[0] = { ...issues[0], issueKey: "WEB-1", type: "BUG", storyPoints: 5, labels: ["frontend"] };
issues[1] = { ...issues[1], issueKey: "WEB-2", type: "STORY", storyPoints: 3, labels: [] };
try {
  await page.goto("http://board.test/#project=1&issue=1");
  let panel = page.getByRole("dialog", { name: "Issue details", exact: true });
  await panel.waitFor();
  assert.equal(await panel.getByRole("combobox", { name: "Issue type", exact: true }).inputValue(), "BUG");
  assert.equal(await panel.getByRole("combobox", { name: "Story points", exact: true }).inputValue(), "5");
  assert.equal(await panel.getByRole("textbox", { name: "Labels", exact: true }).inputValue(), "frontend");
  assert.equal(await panel.getByRole("link", { name: "Open issue link" }).getAttribute("href"), "#project=1&issue=1");
  await panel.getByRole("combobox", { name: "Issue type", exact: true }).selectOption("STORY");
  await panel.getByRole("combobox", { name: "Story points", exact: true }).selectOption("8");
  await panel.getByRole("textbox", { name: "Labels", exact: true }).fill("bad,label!");
  await panel.getByRole("button", { name: "Save changes", exact: true }).click();
  await panel.getByRole("alert").filter({ hasText: "Use up to 10 labels" }).waitFor();
  await panel.getByRole("textbox", { name: "Labels", exact: true }).fill("frontend, api");
  await panel.getByRole("button", { name: "Save changes", exact: true }).click();
  await panel.waitFor({ state: "hidden" });
  assert.equal(issues[0].type, "STORY"); assert.equal(issues[0].storyPoints, 8);
  assert.deepEqual(issues[0].labels, ["frontend", "api"]);
  await page.getByRole("combobox", { name: "Filter by issue type" }).selectOption("BUG");
  assert.equal(await page.locator("article").count(), 0);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByRole("textbox", { name: "Search issue titles" }).fill("web-1");
  assert.equal(await page.locator("article").count(), 1);
  await page.getByRole("textbox", { name: "Search issue titles" }).fill("api");
  assert.equal(await page.locator("article").count(), 1);
  currentUserId = 8;
  await page.reload();
  panel = page.getByRole("dialog", { name: "Issue details", exact: true });
  await panel.waitFor();
  assert.equal(await panel.getByRole("combobox", { name: "Issue type", exact: true }).isDisabled(), true);
  assert.equal(await panel.getByRole("combobox", { name: "Story points", exact: true }).isDisabled(), true);
  assert.equal(await panel.getByRole("textbox", { name: "Labels", exact: true }).isDisabled(), true);
  await panel.getByRole("button", { name: "Close issue details", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: "tests/board-structured-mobile.png", fullPage: true });
  await page.goto("http://board.test/#project=1&issue=999");
  await page.getByRole("alert").filter({ hasText: "no longer available" }).waitFor();
  assert.equal(await page.getByRole("dialog", { name: "Issue details", exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  console.log("Structured issues: direct links, metadata save, validation, type/key/label filtering, owner-only fields, stale links and mobile checks passed.");
} finally { await browser.close(); }
