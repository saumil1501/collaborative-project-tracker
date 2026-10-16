import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import assert from "node:assert/strict";
const { chromium } = createRequire(import.meta.url)("playwright");
const browser = await chromium.launch({ headless: true, channel: process.env.BOARD_TEST_BROWSER || "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = []; page.on("pageerror", error => errors.push(error.message));
const dist = resolve("dist");
await page.route("http://analytics.test/**", async route => {
  const path = new URL(route.request().url()).pathname;
  const file = resolve(dist, path === "/" ? "index.html" : `.${path}`);
  if (!file.startsWith(dist + sep)) return route.fulfill({ status: 403 });
  try { return route.fulfill({ body: await readFile(file), contentType: ({ ".html": "text/html", ".js": "application/javascript", ".css": "text/css" })[extname(file)] || "application/octet-stream" }); }
  catch { return route.fulfill({ status: 404 }); }
});
const project = { id: 1, name: "Product launch", description: "Measure progress and delivery", ownerId: 7, createdAt: "2026-10-10T12:00:00" };
const members = [{ userId: 7, name: "Sam Lee", email: "sam@example.test", role: "OWNER" }, { userId: 8, name: "Alex Kim", email: "alex@example.test", role: "MEMBER" }];
let currentUserId = 7, failAnalytics = true, slowNext = false, emptyMode = false, calls = 0;
const metrics = (total, todo, inProgress, done, estimatedIssues, totalPoints, completedPoints, overdue, blocked) => ({ total, todo, inProgress, done, estimatedIssues, totalPoints, completedPoints, overdue, blocked });
const reports = [
  { id: 11, name: "Next iteration", status: "PLANNED", metrics: metrics(1,1,0,0,1,5,0,0,1), committedIssues: null, committedPoints: null, netIssueChange: null, netPointChange: null },
  { id: 10, name: "Current iteration", status: "ACTIVE", metrics: metrics(3,1,1,1,2,8,3,1,1), committedIssues: 4, committedPoints: 13, netIssueChange: -1, netPointChange: -5 },
  { id: 9, name: "Iteration two", status: "COMPLETED", metrics: metrics(4,1,0,3,4,13,8,null,null), committedIssues: 3, committedPoints: 5, netIssueChange: 1, netPointChange: 8 },
  { id: 8, name: "Iteration one", status: "COMPLETED", metrics: metrics(2,0,1,1,2,5,3,null,null), committedIssues: 2, committedPoints: 8, netIssueChange: 0, netPointChange: -3 },
].map(sprint => ({ ...sprint, goal: "Deliver a useful increment", startDate: "2026-10-01", endDate: "2026-10-16", startedAt: sprint.status === "PLANNED" ? null : "2026-10-01T12:00:00Z", completedAt: sprint.status === "COMPLETED" ? (sprint.id === 9 ? "2026-10-15T12:00:00Z" : "2026-10-08T12:00:00Z") : null }));
const data = {
  generatedAt: "2026-10-16T12:00:00Z", asOfDate: "2026-10-16", project: metrics(8,3,2,3,6,24,8,2,2), epicCount: 2, subtaskCount: 2, backlogIssues: 2,
  types: [{ type: "STORY", total: 3, done: 1 }, { type: "TASK", total: 4, done: 2 }, { type: "BUG", total: 1, done: 0 }],
  workload: [{ userId: 7, name: "Sam Lee", metrics: metrics(4,1,1,2,3,13,5,0,1) }, { userId: 8, name: "Alex Kim", metrics: metrics(3,1,1,1,2,8,3,1,1) }, { userId: null, name: "Unassigned", metrics: metrics(1,1,0,0,1,3,0,1,0) }],
  attentionTotal: 3,
  attention: [{ issueId: 1, issueKey: "WEB-1", title: "Review authentication", status: "IN_PROGRESS", priority: "HIGH", assigneeName: "Alex Kim", dueDate: "2026-10-15", overdue: true, blockers: ["WEB-2"] }, { issueId: 2, issueKey: "WEB-2", title: "Release gateway", status: "TODO", priority: "HIGH", assigneeName: "Sam Lee", dueDate: "2026-10-16", overdue: false, blockers: ["WEB-3"] }, { issueId: 3, issueKey: "WEB-3", title: "Update documentation", status: "TODO", priority: "MEDIUM", assigneeName: null, dueDate: "2026-10-14", overdue: true, blockers: [] }],
  sprints: reports, trend: { completedSprints: 2, sampleSize: 2, averageCompletedIssues: 2, averageCompletedPoints: 5.5, recentSprintIds: [9,8] },
};
const empty = () => ({ ...data, project: metrics(0,0,0,0,0,0,0,0,0), epicCount: 0, subtaskCount: 0, backlogIssues: 0, types: data.types.map(type => ({ ...type, total: 0, done: 0 })), workload: data.workload.map(row => ({ ...row, metrics: metrics(0,0,0,0,0,0,0,0,0) })), attention: [], attentionTotal: 0, sprints: [], trend: { completedSprints: 0, sampleSize: 0, averageCompletedIssues: null, averageCompletedPoints: null, recentSprintIds: [] } });
const issues = Array.from({ length: 8 }, (_, index) => ({ id: index + 1, title: data.attention[index]?.title || `Delivery task ${index + 1}`, description: "A useful increment", status: index < 3 ? data.attention[index].status : "DONE", priority: "HIGH", assigneeId: 7, assigneeName: "Sam Lee", type: "TASK", parentId: null, issueKey: `WEB-${index + 1}`, storyPoints: null, labels: [], dueDate: null, sprintId: null, createdAt: "2026-10-10T12:00:00", blockedBy: [], blocks: [] }));
await page.route("**/api/**", async route => {
  const request = route.request(), path = new URL(request.url()).pathname, method = request.method();
  const reply = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
  if (path.endsWith("/csrf")) return reply({ token: "test" });
  if (path.endsWith("/me")) { const user = members.find(item => item.userId === currentUserId); return reply({ id: currentUserId, name: user.name, email: user.email }); }
  if (path === "/api/notifications") return reply({ items: [], unreadCount: 0 });
  if (path === "/api/projects") return reply([project]);
  if (path === "/api/projects/1") return reply(project);
  if (path.endsWith("/members")) return reply(members);
  if (path.endsWith("/sprints") || path.endsWith("/comments") || path.endsWith("/activity")) return reply([]);
  if (path.endsWith("/analytics")) {
    calls++; if (failAnalytics) return reply({}, 500);
    const snapshot = structuredClone(emptyMode ? empty() : data);
    if (slowNext) { slowNext = false; await new Promise(resolve => setTimeout(resolve, 1100)); }
    return reply(snapshot);
  }
  if (path.endsWith("/issues") && method === "GET") return reply(issues);
  if (path.endsWith("/issues") && method === "POST") {
    const issue = { ...request.postDataJSON(), id: 100, issueKey: "WEB-100", status: "TODO", assigneeName: null, createdAt: "2026-10-16T12:00:00", sprintId: null, blockedBy: [], blocks: [] };
    issues.unshift(issue); data.project.total++; data.project.todo++; data.backlogIssues++; data.types.find(type => type.type === "TASK").total++;
    data.workload.find(row => row.userId === null).metrics.total++; data.workload.find(row => row.userId === null).metrics.todo++;
    return reply(issue, 201);
  }
  return reply({}, 404);
});
const view = () => page.getByRole("region", { name: "Project and sprint analytics", exact: true });
const summary = () => view().getByLabel("Project analytics summary", { exact: true });
const selected = () => view().getByRole("region", { name: "Selected sprint report", exact: true });
try {
  await page.goto("http://analytics.test/"); await page.getByRole("button", { name: "Open Board", exact: true }).click();
  assert.equal(calls, 0, "Analytics should load only when opened");
  await page.getByRole("button", { name: "Analytics", exact: true }).click(); await view().getByRole("button", { name: "Retry analytics", exact: true }).waitFor();
  failAnalytics = false; await view().getByRole("button", { name: "Retry analytics", exact: true }).click();
  await view().getByRole("img", { name: "Project status distribution: 3 to do, 2 in progress, 3 done", exact: true }).waitFor();
  assert.match(await summary().innerText(), /Total work items\s+8/); assert.match(await summary().innerText(), /Blocked work\s+2/);
  await view().getByText("Tracked separately: 2 epics", { exact: false }).waitFor();
  await selected().getByRole("heading", { name: "Current iteration", exact: true }).waitFor();
  assert.match(await selected().innerText(), /Net issue scope change\s+-1/);
  await view().getByRole("region", { name: "Current assignee workload", exact: true }).getByRole("rowheader", { name: "Unassigned", exact: true }).waitFor();
  await view().getByRole("link", { name: "Open WEB-1 in a new tab", exact: true }).waitFor();
  assert.equal(await view().getByRole("link", { name: "Open WEB-1 in a new tab", exact: true }).getAttribute("href"), "#project=1&issue=1");
  await view().getByRole("button", { name: "Compare issues", exact: true }).click();
  await view().getByRole("img", { name: "Iteration two: 3 issues initially committed, 3 completed", exact: true }).waitFor();
  await view().getByRole("button", { name: "Compare points", exact: true }).click();
  await view().getByRole("img", { name: "Iteration two: 5 points initially committed, 8 completed", exact: true }).waitFor();
  await view().getByLabel("Sprint report", { exact: true }).selectOption("9");
  await selected().getByText("Historical overdue and blocker counts are unavailable in completion snapshots.", { exact: true }).waitFor();
  assert.match(await selected().innerText(), /Net estimated points change\s+\+8/);
  await page.screenshot({ path: "tests/board-analytics-desktop.png", fullPage: true });
  await view().getByLabel("Sprint report", { exact: true }).selectOption("11"); assert.match(await selected().innerText(), /Not started/);
  failAnalytics = true; await view().getByRole("button", { name: "Refresh analytics", exact: true }).click();
  await view().getByText("Figures below are from the last successful refresh.", { exact: true }).waitFor();
  assert.match(await summary().innerText(), /Total work items\s+8/); failAnalytics = false;
  await view().getByRole("button", { name: "Retry analytics", exact: true }).click(); await view().getByRole("button", { name: "Refresh analytics", exact: true }).waitFor({ state: "visible" });
  slowNext = true; await view().getByRole("button", { name: "Refresh analytics", exact: true }).click();
  await page.getByRole("button", { name: "New issue", exact: true }).click(); await page.getByRole("dialog").getByLabel(/^Title/).fill("New delivery task"); await page.getByRole("dialog").getByRole("button", { name: "Create issue", exact: true }).click();
  await view().getByRole("img", { name: "Project status distribution: 4 to do, 2 in progress, 3 done", exact: true }).waitFor(); await page.waitForTimeout(1200);
  assert.match(await summary().innerText(), /Total work items\s+9/, "A stale response must not replace newer analytics");
  currentUserId = 8; await page.reload(); await page.getByRole("button", { name: "Open Board", exact: true }).click(); await page.getByRole("button", { name: "Analytics", exact: true }).click();
  await view().getByRole("region", { name: "Current assignee workload", exact: true }).waitFor(); assert.equal(await page.getByRole("button", { name: "New issue", exact: true }).count(), 0);
  await view().getByLabel("Sprint report", { exact: true }).selectOption("9"); await selected().getByRole("heading", { name: "Iteration two", exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: "tests/board-analytics-mobile.png", fullPage: true });
  emptyMode = true; await view().getByRole("button", { name: "Refresh analytics", exact: true }).click();
  await view().getByText("No stories, tasks or bugs yet. Create work to begin tracking project progress.", { exact: true }).waitFor();
  await view().getByText("Complete a sprint to see delivery trends.", { exact: false }).waitFor();
  assert.equal(await view().getByLabel("Sprint report", { exact: true }).isDisabled(), true);
  assert.equal((await view().innerText()).includes("NaN"), false);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.getByRole("button", { name: "All issues", exact: true }).click(); await page.getByRole("combobox", { name: "Status for New delivery task", exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log("Analytics browser checks passed: project metrics, workload, attention links, live/planned/completed sprint reports, delivery chart toggles, failure recovery, stale-response protection, member access, empty states and mobile layout.");
} finally { await browser.close(); }
