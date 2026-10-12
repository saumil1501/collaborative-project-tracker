import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import assert from "node:assert/strict";
const { chromium } = createRequire(import.meta.url)("playwright");
const browser = await chromium.launch({ headless: true, channel: process.env.BOARD_TEST_BROWSER || "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = []; page.on("pageerror", error => errors.push(error.message));
const dist = resolve("dist");
await page.route("http://dependencies.test/**", async route => {
  const path = new URL(route.request().url()).pathname;
  const file = resolve(dist, path === "/" ? "index.html" : `.${path}`);
  if (!file.startsWith(dist + sep)) return route.fulfill({ status: 403 });
  try { return route.fulfill({ body: await readFile(file), contentType: ({ ".html": "text/html", ".js": "application/javascript", ".css": "text/css" })[extname(file)] || "application/octet-stream" }); }
  catch { return route.fulfill({ status: 404 }); }
});
const project = { id: 1, name: "Product launch", description: "Plan the work in order", ownerId: 7, createdAt: "2026-10-10T12:00:00" };
const members = [{ userId: 7, name: "Sam Lee", email: "sam@example.test", role: "OWNER" }, { userId: 8, name: "Alex Kim", email: "alex@example.test", role: "MEMBER" }];
let currentUserId = 7, failLink = false, failRead = false, failRefreshAfterAdd = false, addCalls = 0, nextLink = 2;
let links = [{ id: 1, blocker: 1, blocked: 2 }];
const comments = [];
let issues = ["Build API", "Build UI", "Deploy", "Already shipped", "Parent story", "Child task"].map((title, index) => ({ id: index + 1, title, description: "Complete prerequisites before moving ahead", status: index === 3 ? "DONE" : "TODO", priority: "HIGH", assigneeId: index === 1 || index === 5 ? 8 : 7, assigneeName: index === 1 || index === 5 ? "Alex Kim" : "Sam Lee", type: index === 4 ? "STORY" : index === 5 ? "SUBTASK" : "TASK", parentId: index === 5 ? 5 : null, parentKey: index === 5 ? "WEB-5" : null, storyPoints: null, labels: [], dueDate: null, createdAt: "2026-10-10T12:00:00", issueKey: `WEB-${index + 1}`, sprintId: null, planningRank: index + 1 }));
const item = (link, id) => { const issue = issues.find(issue => issue.id === id); return { id: link.id, issueId: id, issueKey: issue.issueKey, title: issue.title, status: issue.status }; };
const response = issue => ({ ...issue, blockedBy: links.filter(link => link.blocked === issue.id).map(link => item(link, link.blocker)), blocks: links.filter(link => link.blocker === issue.id).map(link => item(link, link.blocked)) });
function createsCycle(blocker, blocked) {
  const edges = [...links.map(link => [link.blocker, link.blocked]), ...issues.filter(issue => issue.parentId).map(issue => [issue.id, issue.parentId])];
  const pending = [blocked], visited = new Set();
  while (pending.length) { const id = pending.pop(); if (id === blocker) return true; if (visited.has(id)) continue; visited.add(id); pending.push(...edges.filter(([source]) => source === id).map(([, target]) => target)); }
  return false;
}
await page.route("**/api/**", async route => {
  const request = route.request(), path = new URL(request.url()).pathname, method = request.method();
  const reply = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
  if (path.endsWith("/csrf")) return reply({ token: "test" });
  if (path.endsWith("/me")) { const user = members.find(item => item.userId === currentUserId); return reply({ id: currentUserId, name: user.name, email: user.email }); }
  if (path === "/api/notifications") return reply({ items: [], unreadCount: 0 });
  if (path === "/api/projects") return reply([project]);
  if (path === "/api/projects/1") return reply(project);
  if (path.endsWith("/members")) return reply(members);
  if (path.endsWith("/sprints") || path.endsWith("/activity")) return reply([]);
  if (path.endsWith("/issues") && method === "GET") return reply(failRead ? {} : issues.map(response), failRead ? 500 : 200);
  const issueId = Number(path.match(/issues\/(\d+)/)?.[1]), issue = issues.find(item => item.id === issueId);
  if (path.endsWith("/comments")) {
    if (method === "GET") return reply(comments.filter(comment => comment.issueId === issueId));
    const comment = { id: 1, issueId, authorId: currentUserId, authorName: "Alex Kim", body: request.postDataJSON().body, createdAt: "2026-10-12T12:00:00", editedAt: null }; comments.push(comment); return reply(comment, 201);
  }
  if (issue && path.endsWith("/dependencies") && method === "POST") {
    addCalls++; if (failLink) return reply({ detail: "Unable to save dependency" }, 500);
    const data = request.postDataJSON(), blocker = data.direction === "BLOCKS" ? issueId : data.targetId, blocked = data.direction === "BLOCKS" ? data.targetId : issueId;
    if (createsCycle(blocker, blocked)) return reply({ detail: "This link would create a dependency cycle, including parent-child completion rules" }, 409);
    if (issues.find(issue => issue.id === blocked).status === "DONE" && issues.find(issue => issue.id === blocker).status !== "DONE") return reply({ detail: "Reopen the completed issue before adding an unfinished blocker" }, 409);
    const link = { id: nextLink++, blocker, blocked }; links.push(link); if (failRefreshAfterAdd) failRead = true; return reply(item(link, data.targetId), 201);
  }
  const linkId = Number(path.match(/dependencies\/(\d+)/)?.[1]);
  if (linkId && method === "DELETE") { links = links.filter(link => link.id !== linkId); return route.fulfill({ status: 204 }); }
  if (issue && path.endsWith("/status")) {
    if (links.some(link => link.blocked === issueId && issues.find(issue => issue.id === link.blocker).status !== "DONE")) return reply({ detail: "Status changes are blocked until blockers are done" }, 409);
    Object.assign(issue, request.postDataJSON()); return reply(response(issue));
  }
  if (issue && method === "DELETE") { links = links.filter(link => link.blocker !== issueId && link.blocked !== issueId); issues = issues.filter(item => item.id !== issueId); return route.fulfill({ status: 204 }); }
  return reply({}, 404);
});
const dialog = () => page.getByRole("dialog", { name: "Issue details", exact: true });
const deps = () => dialog().getByRole("region", { name: "Issue dependencies", exact: true });
const close = () => page.getByRole("button", { name: "Close issue details", exact: true }).click();
const open = title => page.locator("article").filter({ hasText: title }).getByRole("button").first().click();
const wait = async predicate => { for (let i = 0; i < 100; i++) { if (await predicate()) return; await page.waitForTimeout(100); } throw new Error("Dependency condition timed out"); };
try {
  await page.goto("http://dependencies.test/"); await page.getByRole("button", { name: "Open Board", exact: true }).click();
  const apiStatus = page.getByRole("combobox", { name: "Status for Build API", exact: true }), uiStatus = page.getByRole("combobox", { name: "Status for Build UI", exact: true });
  await uiStatus.waitFor(); assert.equal(await uiStatus.isDisabled(), true); assert.equal(await page.locator("article").filter({ hasText: "Build UI" }).getAttribute("draggable"), "false");
  await page.locator("article").filter({ hasText: "Build UI" }).getByText("Blocked: 1", { exact: true }).waitFor();
  await page.screenshot({ path: "tests/board-dependencies-desktop.png", fullPage: true });
  await open("Build UI"); assert.equal(await dialog().getByLabel("Issue status", { exact: true }).isDisabled(), true);
  await deps().getByRole("button", { name: "Remove dependency WEB-1", exact: true }).click(); await deps().getByRole("button", { name: "Keep link", exact: true }).click(); assert.equal(links.length, 1); await close();
  await apiStatus.selectOption("DONE"); await wait(async () => await uiStatus.isEnabled());
  await uiStatus.selectOption("IN_PROGRESS"); await wait(async () => await uiStatus.isEnabled());
  await apiStatus.selectOption("TODO"); await wait(async () => await uiStatus.isDisabled());
  await open("Build UI"); await deps().getByLabel("Relationship", { exact: true }).selectOption("BLOCKS"); await deps().getByLabel("Related issue", { exact: true }).selectOption("3"); failLink = true;
  await deps().getByRole("button", { name: "Add dependency link", exact: true }).click(); await deps().getByText("Unable to save dependency", { exact: true }).waitFor();
  assert.equal(await deps().getByLabel("Related issue", { exact: true }).inputValue(), "3"); failLink = false;
  await deps().getByRole("button", { name: "Add dependency link", exact: true }).click(); await deps().getByText("Dependencies updated.", { exact: true }).waitFor(); await close();
  assert.equal(await page.getByRole("combobox", { name: "Status for Deploy", exact: true }).isDisabled(), true);
  await open("Deploy"); await deps().getByLabel("Relationship", { exact: true }).selectOption("BLOCKS"); await deps().getByLabel("Related issue", { exact: true }).selectOption("1");
  await deps().getByRole("button", { name: "Add dependency link", exact: true }).click(); await deps().getByText(/would create a dependency cycle/).waitFor(); await close();
  await open("Parent story"); await deps().getByLabel("Relationship", { exact: true }).selectOption("BLOCKS"); await deps().getByLabel("Related issue", { exact: true }).selectOption("6");
  await deps().getByRole("button", { name: "Add dependency link", exact: true }).click(); await deps().getByText(/would create a dependency cycle/).waitFor(); await close();
  currentUserId = 8; await page.reload(); await page.getByRole("button", { name: "Open Board", exact: true }).click(); await uiStatus.waitFor(); assert.equal(await uiStatus.isDisabled(), true);
  await open("Build UI"); assert.equal(await deps().getByLabel("Related issue", { exact: true }).count(), 0); assert.equal(await deps().getByRole("button", { name: /^Remove dependency/ }).count(), 0);
  await dialog().getByRole("textbox", { name: "Add a comment", exact: true }).fill("Waiting for API completion."); await dialog().getByRole("button", { name: "Post comment", exact: true }).click(); await dialog().getByText("Waiting for API completion.", { exact: true }).waitFor();
  issues.find(issue => issue.id === 1).status = "DONE";
  await deps().getByRole("button", { name: "Refresh dependencies", exact: true }).click(); await deps().getByText("Dependencies refreshed.", { exact: true }).waitFor();
  assert.equal(await dialog().getByLabel("Issue status", { exact: true }).isEnabled(), true);
  await dialog().getByLabel("Issue status", { exact: true }).selectOption("DONE"); await wait(async () => await dialog().getByLabel("Issue status", { exact: true }).isEnabled()); await close();
  assert.equal(await page.getByRole("combobox", { name: "Status for Deploy", exact: true }).isDisabled(), true, "Member still cannot change another member's status");
  currentUserId = 7; await page.reload(); await page.getByRole("button", { name: "Open Board", exact: true }).click(); await apiStatus.waitFor();
  await open("Build API"); await dialog().getByRole("button", { name: "Delete issue", exact: true }).click(); await dialog().getByRole("button", { name: "Yes, delete issue", exact: true }).click(); await wait(async () => !(await page.getByRole("dialog").count()));
  assert.equal(links.some(link => link.blocker === 1 || link.blocked === 1), false); assert.equal(await uiStatus.isEnabled(), true);
  await uiStatus.selectOption("TODO"); await wait(async () => await uiStatus.isEnabled());
  await open("Build UI"); await deps().getByRole("button", { name: "Remove dependency WEB-3", exact: true }).click(); await deps().getByRole("button", { name: "Confirm link removal", exact: true }).click(); await deps().getByText("Dependencies updated.", { exact: true }).waitFor();
  await deps().getByLabel("Relationship", { exact: true }).selectOption("BLOCKED_BY"); await deps().getByLabel("Related issue", { exact: true }).selectOption("3"); failRefreshAfterAdd = true;
  await deps().getByRole("button", { name: "Add dependency link", exact: true }).click(); await deps().getByRole("button", { name: "Reload dependencies", exact: true }).waitFor();
  assert.equal(await dialog().getByLabel("Issue status", { exact: true }).isDisabled(), true, "Saved-but-stale dependency data must lock status controls");
  const calls = addCalls; failRefreshAfterAdd = false; failRead = false; await deps().getByRole("button", { name: "Reload dependencies", exact: true }).click(); await deps().getByText("Dependencies refreshed.", { exact: true }).waitFor();
  assert.equal(addCalls, calls, "Retry must only reload; never repeat a saved mutation"); assert.equal(await dialog().getByLabel("Issue status", { exact: true }).isDisabled(), true);
  await page.setViewportSize({ width: 390, height: 844 }); await deps().scrollIntoViewIfNeeded(); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: "tests/board-dependencies-panel.png", fullPage: true }); await close(); await page.screenshot({ path: "tests/board-dependencies-mobile.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log("Dependency browser checks passed: owner/member locks, live unblock/relock, owner-only link management, cycle protection, discussion access, deletion cleanup, failed-save/refresh recovery and mobile layout.");
} finally { await browser.close(); }
