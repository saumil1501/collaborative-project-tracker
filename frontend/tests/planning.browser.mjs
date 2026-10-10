import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import assert from "node:assert/strict";
const { chromium } = createRequire(import.meta.url)("playwright");
const browser = await chromium.launch({ headless: true, channel: process.env.BOARD_TEST_BROWSER || "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = []; page.on("pageerror", error => errors.push(error.message));
const dist = resolve("dist");
await page.route("http://planning.test/**", async route => {
  const path = new URL(route.request().url()).pathname;
  const file = resolve(dist, path === "/" ? "index.html" : `.${path}`);
  if (!file.startsWith(dist + sep)) return route.fulfill({ status: 403 });
  try { return route.fulfill({ body: await readFile(file), contentType: ({ ".html": "text/html", ".js": "application/javascript", ".css": "text/css" })[extname(file)] || "application/octet-stream" }); }
  catch { return route.fulfill({ status: 404 }); }
});
const project = { id: 1, name: "Product launch", description: "Plan and deliver together", ownerId: 7, projectKey: "WEB", createdAt: "2026-10-10T12:00:00" };
const members = [{ userId: 7, name: "Sam Lee", email: "sam@example.test", role: "OWNER" }, { userId: 8, name: "Alex Kim", email: "alex@example.test", role: "MEMBER" }];
let currentUserId = 7, failCreate = false, failOrder = false, failLoad = false, failRefresh = false, failMoveRefresh = false, moveCalls = 0, failIssueRead = false;
let issues = ["Implement login", "Review API", "Documentation", "Already shipped"].map((title, index) => ({ id: index + 1, title, description: "Deliver a useful increment", status: index === 3 ? "DONE" : "TODO", priority: "MEDIUM", assigneeId: index === 0 ? 8 : 7, assigneeName: index === 0 ? "Alex Kim" : "Sam Lee", type: "STORY", storyPoints: index === 0 ? 3 : 5, labels: [], dueDate: null, createdAt: "2026-10-10T12:00:00", issueKey: `WEB-${index + 1}`, sprintId: null, planningRank: index + 1 }));
let sprints = [], nextSprint = 1;
await page.route("**/api/**", async route => {
  const request = route.request(), path = new URL(request.url()).pathname, method = request.method();
  const reply = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
  if (path.endsWith("/csrf")) return reply({ token: "test" });
  if (path.endsWith("/me")) { const user = members.find(item => item.userId === currentUserId); return reply({ id: currentUserId, name: user.name, email: user.email }); }
  if (path === "/api/notifications") return reply({ items: [], unreadCount: 0 });
  if (path === "/api/projects") return reply([project]);
  if (path === "/api/projects/1") return reply(project);
  if (path.endsWith("/members")) return reply(members);
  if (path.endsWith("/comments") || path.endsWith("/activity") || path.endsWith("/leave-requests")) return reply([]);
  if (path.endsWith("/issues") && method === "GET") return reply(failIssueRead ? {} : issues, failIssueRead ? 500 : 200);
  if (path.endsWith("/sprints") && method === "GET") return reply(failLoad || failRefresh ? {} : sprints, failLoad || failRefresh ? 500 : 200);
  if (path.endsWith("/sprints") && method === "POST") {
    if (failCreate) return reply({}, 500);
    const sprint = { ...request.postDataJSON(), id: nextSprint++, status: "PLANNED", startedAt: null, completedAt: null, committedIssueCount: null, committedPoints: null, snapshots: [] };
    sprints.unshift(sprint); return reply(sprint, 201);
  }
  if (path.endsWith("/backlog/order")) {
    if (failOrder) return reply({}, 500);
    request.postDataJSON().issueIds.forEach((id,index) => { issues.find(issue => issue.id === id).planningRank = index + 1; }); return route.fulfill({ status: 204 });
  }
  const sprintId = Number(path.match(/sprints\/(\d+)/)?.[1]), sprint = sprints.find(item => item.id === sprintId);
  if (sprint) {
    if (method === "PUT") { Object.assign(sprint, request.postDataJSON()); return reply(sprint); }
    if (path.endsWith("/start")) { sprint.status = "ACTIVE"; sprint.startedAt = "2026-10-10T12:00:00Z"; const scope = issues.filter(issue => issue.sprintId === sprint.id); sprint.committedIssueCount = scope.length; sprint.committedPoints = scope.reduce((total, issue) => total + (issue.storyPoints || 0), 0); return reply(sprint); }
    if (path.endsWith("/complete")) { sprint.status = "COMPLETED"; sprint.completedAt = "2026-10-17T12:00:00Z"; sprint.snapshots = issues.filter(issue => issue.sprintId === sprint.id).map(issue => ({ issueId: issue.id, issueKey: issue.issueKey, title: issue.title, status: issue.status, storyPoints: issue.storyPoints, assigneeName: issue.assigneeName })); issues.forEach(issue => { if (issue.sprintId === sprint.id) { issue.sprintId = null; if (issue.status !== "DONE") issue.planningRank = 20 + issue.id; } }); return reply(sprint); }
    if (method === "DELETE") { issues.forEach(issue => { if (issue.sprintId === sprint.id) issue.sprintId = null; }); sprints = sprints.filter(item => item.id !== sprint.id); return route.fulfill({ status: 204 }); }
  }
  const issueId = Number(path.match(/issues\/(\d+)/)?.[1]), issue = issues.find(item => item.id === issueId);
  if (issue) {
    if (path.endsWith("/sprint")) { moveCalls++; issue.sprintId = request.postDataJSON().sprintId; if (failMoveRefresh) failRefresh = true; return route.fulfill({ status: 204 }); }
    if (method === "PATCH" || method === "PUT") { Object.assign(issue, request.postDataJSON()); return reply(issue); }
    if (method === "DELETE") { issues = issues.filter(item => item.id !== issueId); return route.fulfill({ status: 204 }); }
  }
  return reply({}, 404);
});
const wait = async predicate => { for (let i = 0; i < 100; i++) { if (await predicate()) return; await page.waitForTimeout(100); } throw new Error("Planning condition timed out"); };
async function create(name) {
  await page.getByRole("button", { name: "Create sprint", exact: true }).click();
  const form = page.getByRole("form", { name: "Create sprint", exact: true });
  await form.getByLabel("Sprint name").fill(name); await form.getByLabel("Sprint goal").fill("Deliver secure access");
  await form.getByLabel("Start date", { exact: true }).fill("2026-10-10"); await form.getByLabel("End date", { exact: true }).fill("2026-10-24");
  return form;
}
try {
  await page.goto("http://planning.test/"); await page.getByRole("button", { name: "Open Board", exact: true }).click();
  await page.getByRole("button", { name: "Backlog", exact: true }).click();
  await page.getByRole("region", { name: "Ordered backlog", exact: true }).getByText("Implement login", { exact: true }).waitFor();
  assert.equal(await page.getByRole("region", { name: "Ordered backlog", exact: true }).getByRole("article").count(), 3);
  failOrder = true; await page.getByRole("button", { name: "Move Review API up", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "couldn't save" }).waitFor();
  assert.equal(await page.getByRole("region", { name: "Ordered backlog" }).getByRole("article").first().getAttribute("aria-label"), "Planning issue Implement login");
  failOrder = false; await page.getByRole("button", { name: "Refresh planning", exact: true }).click();
  await page.getByText("Planning refreshed.", { exact: true }).waitFor();
  assert.equal(await page.getByRole("alert").count(), 0);
  await page.getByRole("button", { name: "Move Review API up", exact: true }).click();
  await wait(async () => await page.getByRole("region", { name: "Ordered backlog" }).getByRole("article").first().getAttribute("aria-label") === "Planning issue Review API");
  let form = await create("Iteration 1"); failCreate = true; await form.getByRole("button", { name: "Save sprint" }).click();
  await page.getByRole("alert").filter({ hasText: "couldn't save" }).waitFor(); assert.equal(await form.getByLabel("Sprint name").inputValue(), "Iteration 1");
  failCreate = false; await form.getByRole("button", { name: "Save sprint" }).click();
  await page.getByRole("region", { name: "Sprint Iteration 1", exact: true }).waitFor();
  failMoveRefresh = true; await page.getByRole("combobox", { name: "Sprint for Implement login", exact: true }).selectOption("1");
  await page.getByRole("button", { name: "Reload planning", exact: true }).waitFor(); assert.equal(moveCalls, 1);
  failMoveRefresh = false; failRefresh = false; await page.getByRole("button", { name: "Reload planning", exact: true }).click();
  await page.getByRole("region", { name: "Sprint Iteration 1" }).getByText("Implement login", { exact: true }).waitFor(); assert.equal(moveCalls, 1);
  await page.getByRole("combobox", { name: "Sprint for Review API", exact: true }).selectOption("1");
  await page.getByRole("region", { name: "Sprint Iteration 1" }).getByText("Review API", { exact: true }).waitFor();
  await page.getByRole("region", { name: "Sprint Iteration 1" }).getByRole("button", { name: "Edit sprint", exact: true }).click();
  form = page.getByRole("form", { name: "Edit sprint", exact: true }); await form.getByLabel("Sprint goal").fill("Deliver login and API review"); await form.getByRole("button", { name: "Save sprint" }).click();
  await page.getByText("Deliver login and API review", { exact: true }).waitFor();
  await page.getByRole("region", { name: "Sprint Iteration 1" }).getByRole("button", { name: "Start sprint", exact: true }).click();
  await page.getByText("At start: 2 issues / 8 points", { exact: true }).waitFor();
  form = await create("Iteration 2"); await form.getByRole("button", { name: "Save sprint" }).click();
  await page.getByRole("region", { name: "Sprint Iteration 2" }).waitFor();
  assert.equal(await page.getByRole("region", { name: "Sprint Iteration 2" }).getByRole("button", { name: "Start sprint" }).isDisabled(), true);
  await page.screenshot({ path: "tests/board-planning-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Sprint board", exact: true }).click(); await page.getByRole("combobox", { name: "Sprint board", exact: true }).waitFor();
  assert.equal(await page.locator("article").count(), 2);
  await page.getByRole("combobox", { name: "Status for Implement login", exact: true }).selectOption("IN_PROGRESS");
  await wait(async () => !(await page.getByRole("combobox", { name: "Status for Implement login", exact: true }).isDisabled()));
  await page.getByRole("combobox", { name: "Status for Review API", exact: true }).selectOption("DONE");
  await wait(async () => !(await page.getByRole("combobox", { name: "Status for Review API", exact: true }).isDisabled()));
  await page.getByRole("button", { name: "Complete sprint", exact: true }).click();
  await page.getByRole("button", { name: "Keep sprint", exact: true }).click();
  assert.equal(sprints.find(item => item.id === 1).status, "ACTIVE");
  await page.getByRole("button", { name: "Complete sprint", exact: true }).click(); await page.getByRole("button", { name: "Confirm completion", exact: true }).click();
  await page.getByRole("region", { name: "Ordered backlog", exact: true }).getByText("Implement login", { exact: true }).waitFor();
  assert.equal(issues.find(issue => issue.id === 1).status, "IN_PROGRESS");
  const history = page.getByRole("region", { name: "Completed sprints" }); await history.getByText("Iteration 1 · 1/2 completed", { exact: true }).click();
  await history.getByText("Historical snapshot; later edits and deletions do not change this report.").waitFor();
  await page.getByRole("region", { name: "Sprint Iteration 2" }).getByRole("button", { name: "Delete planned sprint" }).click();
  await page.getByRole("button", { name: "Confirm sprint deletion", exact: true }).click();
  await wait(async () => !(await page.getByRole("region", { name: "Sprint Iteration 2" }).count()));
  currentUserId = 8; failLoad = true; await page.reload(); await page.getByRole("button", { name: "Open Board", exact: true }).click(); await page.getByRole("button", { name: "Backlog", exact: true }).click();
  await page.getByRole("button", { name: "Reload planning", exact: true }).waitFor(); failLoad = false; await page.getByRole("button", { name: "Reload planning", exact: true }).click();
  await page.getByRole("region", { name: "Ordered backlog" }).getByText("Implement login", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Create sprint", exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: /^Move .* (up|down)$/ }).count(), 0);
  assert.equal(await page.getByRole("combobox", { name: "Sprint for Implement login", exact: true }).isDisabled(), true);
  await page.getByRole("region", { name: "Ordered backlog" }).getByRole("button", { name: /Implement login/ }).click();
  await page.getByRole("dialog", { name: "Issue details", exact: true }).waitFor(); assert.equal(await page.getByRole("textbox", { name: /^Title/ }).isDisabled(), true);
  await page.getByRole("button", { name: "Close issue details", exact: true }).click();
  failIssueRead = true; await page.reload(); await page.getByRole("button", { name: "Open Board", exact: true }).click();
  await page.getByRole("button", { name: "Backlog", exact: true }).click();
  await page.getByRole("button", { name: "Reload board", exact: true }).waitFor();
  failIssueRead = false; await page.getByRole("button", { name: "Reload board", exact: true }).click();
  await page.getByRole("region", { name: "Ordered backlog" }).getByText("Implement login", { exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: "tests/board-planning-mobile.png", fullPage: true });
  sprints[0].name = "S".repeat(150); sprints[0].goal = "G".repeat(1000);
  sprints[0].snapshots[0].assigneeName = "N".repeat(100);
  issues[0].title = "I".repeat(150); issues[0].assigneeName = "A".repeat(100);
  issues[0].issueKey = "PRJ" + "9".repeat(19) + "-" + "9".repeat(19);
  await page.getByRole("button", { name: "Refresh planning", exact: true }).click();
  await page.getByText("Planning refreshed.", { exact: true }).waitFor();
  await page.getByRole("region", { name: "Completed sprints" }).locator("summary").click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Long names, keys and goals must wrap on mobile");
  assert.deepEqual(errors, []);
  console.log("Planning browser checks passed: ordering, failure recovery, create/edit/move/start/complete/delete, scoped board, archived reports, member permissions, refresh recovery and mobile layout.");
} finally { await browser.close(); }
