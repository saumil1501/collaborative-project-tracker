import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import assert from "node:assert/strict";
const { chromium } = createRequire(import.meta.url)("playwright");
const browser = await chromium.launch({ headless: true, channel: process.env.BOARD_TEST_BROWSER || "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = []; page.on("pageerror", error => errors.push(error.message));
const dist = resolve("dist");
await page.route("http://hierarchy.test/**", async route => {
  const path = new URL(route.request().url()).pathname;
  const file = resolve(dist, path === "/" ? "index.html" : `.${path}`);
  if (!file.startsWith(dist + sep)) return route.fulfill({ status: 403 });
  try { return route.fulfill({ body: await readFile(file), contentType: ({ ".html": "text/html", ".js": "application/javascript", ".css": "text/css" })[extname(file)] || "application/octet-stream" }); }
  catch { return route.fulfill({ status: 404 }); }
});
const project = { id: 1, name: "Product launch", description: "Plan and deliver together", ownerId: 7, projectKey: "WEB", createdAt: "2026-10-10T12:00:00" };
const members = [{ userId: 7, name: "Sam Lee", email: "sam@example.test", role: "OWNER" }, { userId: 8, name: "Alex Kim", email: "alex@example.test", role: "MEMBER" }];
let currentUserId = 7, failSave = false, nextId = 5;
const issues = [
  { id: 1, title: "Authentication", type: "EPIC", parentId: null, sprintId: null, assigneeId: 7, storyPoints: null },
  { id: 2, title: "User login", type: "STORY", parentId: 1, sprintId: 1, assigneeId: 7, storyPoints: 5 },
  { id: 3, title: "Test login", type: "SUBTASK", parentId: 2, sprintId: null, assigneeId: 8, storyPoints: null },
  { id: 4, title: "Deployment", type: "TASK", parentId: null, sprintId: null, assigneeId: null, storyPoints: 3 },
].map(issue => ({ ...issue, description: "Deliver a useful increment", status: "TODO", priority: "MEDIUM", labels: [], dueDate: null, createdAt: "2026-10-10T12:00:00", issueKey: `WEB-${issue.id}`, planningRank: issue.id }));
const response = issue => ({ ...issue, parentKey: issues.find(parent => parent.id === issue.parentId)?.issueKey || null, assigneeName: members.find(member => member.userId === issue.assigneeId)?.name || null, sprintId: issue.type === "SUBTASK" ? issues.find(parent => parent.id === issue.parentId)?.sprintId || null : issue.sprintId });
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
  if (path.endsWith("/sprints")) return reply([{ id: 1, name: "Login sprint", goal: "Deliver login", startDate: "2026-10-10", endDate: "2026-10-24", status: "PLANNED", snapshots: [] }]);
  if (path.endsWith("/issues") && method === "GET") return reply(issues.map(response));
  if (path.endsWith("/issues") && method === "POST") {
    if (failSave) return reply({ detail: "Unable to save. Please retry." }, 500);
    const issue = { ...request.postDataJSON(), id: nextId++, status: "TODO", sprintId: null, createdAt: "2026-10-10T12:00:00", planningRank: nextId };
    issue.issueKey = `WEB-${issue.id}`; issues.push(issue); return reply(response(issue), 201);
  }
  const issue = issues.find(item => item.id === Number(path.match(/issues\/(\d+)/)?.[1]));
  if (issue) {
    if (method === "PUT") { if (failSave) return reply({ detail: "Unable to save. Please retry." }, 500); Object.assign(issue, request.postDataJSON()); return reply(response(issue)); }
    if (path.endsWith("/status")) {
      if (request.postDataJSON().status === "DONE" && issues.some(child => child.parentId === issue.id && child.status !== "DONE")) return reply({ detail: "Complete all child issues before marking their parent done" }, 409);
      Object.assign(issue, request.postDataJSON()); return reply(response(issue));
    }
    if (method === "DELETE") {
      if (issues.some(child => child.parentId === issue.id)) return reply({ detail: "Move or delete child issues before deleting their parent" }, 409);
      issues.splice(issues.indexOf(issue), 1); return route.fulfill({ status: 204 });
    }
  }
  return reply({}, 404);
});
const dialog = () => page.getByRole("dialog", { name: "Issue details", exact: true });
const newDialog = () => page.getByRole("dialog", { name: "New issue", exact: true });
const close = () => page.getByRole("button", { name: "Close issue details", exact: true }).click();
const wait = async predicate => { for (let i = 0; i < 100; i++) { if (await predicate()) return; await page.waitForTimeout(100); } throw new Error("Hierarchy condition timed out"); };
try {
  await page.goto("http://hierarchy.test/"); await page.getByRole("button", { name: "Open Board", exact: true }).click();
  await page.getByRole("button", { name: "Epics", exact: true }).click();
  const hierarchy = page.getByRole("region", { name: "Epic hierarchy", exact: true });
  await hierarchy.getByRole("heading", { name: "Authentication", exact: true }).waitFor();
  assert.equal(await hierarchy.getByRole("progressbar").getAttribute("aria-valuenow"), "0");
  await hierarchy.getByRole("button", { name: "Create epic", exact: true }).click();
  assert.equal(await newDialog().getByLabel("Issue type", { exact: true }).inputValue(), "EPIC");
  assert.equal(await newDialog().getByLabel("Story points", { exact: true }).isDisabled(), true);
  assert.equal(await newDialog().getByLabel("Parent issue", { exact: true }).count(), 0);
  await newDialog().getByLabel(/^Title/).fill("Release readiness"); failSave = true;
  await newDialog().getByRole("button", { name: "Create issue", exact: true }).click();
  await newDialog().getByText("Unable to save. Please retry.", { exact: true }).waitFor();
  assert.equal(await newDialog().getByLabel(/^Title/).inputValue(), "Release readiness"); failSave = false;
  await newDialog().getByRole("button", { name: "Create issue", exact: true }).click();
  await hierarchy.getByRole("heading", { name: "Release readiness", exact: true }).waitFor();
  await hierarchy.getByRole("button", { name: "Add issue to WEB-1", exact: true }).click();
  assert.equal(await newDialog().getByLabel("Epic", { exact: true }).inputValue(), "1");
  await newDialog().getByLabel(/^Title/).fill("Password reset"); await newDialog().getByLabel("Story points", { exact: true }).selectOption("3");
  await newDialog().getByRole("button", { name: "Create issue", exact: true }).click();
  await hierarchy.getByText("Password reset", { exact: true }).waitFor(); assert.equal(issues.at(-1).parentId, 1);
  await hierarchy.getByRole("button", { name: "Add subtask to WEB-2", exact: true }).click();
  assert.equal(await newDialog().getByLabel("Issue type", { exact: true }).inputValue(), "SUBTASK");
  assert.equal(await newDialog().getByLabel("Parent issue", { exact: true }).inputValue(), "2");
  const parentOptions = await newDialog().getByLabel("Parent issue", { exact: true }).locator("option").allTextContents();
  assert.equal(parentOptions.some(text => text.includes("Authentication") || text.includes("Test login")), false);
  await newDialog().getByLabel(/^Title/).fill("Implement session storage"); await newDialog().getByLabel("Assignee", { exact: true }).selectOption("8");
  await newDialog().getByRole("button", { name: "Create issue", exact: true }).click();
  await hierarchy.getByText("Implement session storage", { exact: true }).waitFor();
  assert.equal(issues.at(-1).type, "SUBTASK"); assert.equal(issues.at(-1).storyPoints, null); assert.equal(issues.at(-1).parentId, 2);
  await hierarchy.getByRole("button").filter({ hasText: "User login" }).first().click();
  await dialog().getByLabel("Issue status", { exact: true }).selectOption("DONE");
  await dialog().getByText("Complete all child issues before marking their parent done", { exact: true }).waitFor();
  assert.equal(await dialog().getByLabel("Issue status", { exact: true }).inputValue(), "TODO");
  await dialog().getByRole("button").filter({ hasText: "Test login" }).click();
  assert.equal(await dialog().getByLabel("Issue type", { exact: true }).isDisabled(), true);
  await dialog().getByLabel("Issue status", { exact: true }).selectOption("DONE");
  await wait(async () => !(await dialog().getByLabel("Issue status", { exact: true }).isDisabled()));
  await close();
  await hierarchy.getByRole("button").filter({ hasText: "Implement session storage" }).click();
  await dialog().getByLabel("Issue status", { exact: true }).selectOption("DONE");
  await wait(async () => !(await dialog().getByLabel("Issue status", { exact: true }).isDisabled())); await close();
  await hierarchy.getByRole("button").filter({ hasText: "User login" }).first().click();
  await dialog().getByLabel("Issue status", { exact: true }).selectOption("DONE");
  await wait(async () => !(await dialog().getByLabel("Issue status", { exact: true }).isDisabled())); await close();
  assert.equal(await hierarchy.getByRole("progressbar", { name: "Progress for Authentication", exact: true }).getAttribute("aria-valuenow"), "50");
  await page.screenshot({ path: "tests/board-hierarchy-desktop.png", fullPage: true });
  await hierarchy.getByRole("heading", { name: "Authentication", exact: true }).click();
  await dialog().getByRole("button", { name: "Delete issue", exact: true }).click();
  await dialog().getByRole("button", { name: "Yes, delete issue", exact: true }).click();
  await dialog().getByText("Move or delete child issues before deleting their parent", { exact: true }).waitFor();
  await dialog().getByRole("button", { name: "Keep issue", exact: true }).click(); await close();
  await hierarchy.getByRole("button").filter({ hasText: "Password reset" }).first().click();
  await dialog().getByLabel("Issue type", { exact: true }).selectOption("BUG");
  assert.equal(await dialog().getByLabel("Epic", { exact: true }).inputValue(), "1", "Standard type changes retain epic membership");
  await dialog().getByLabel("Epic", { exact: true }).selectOption("5");
  await dialog().getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("region", { name: "Epic Release readiness", exact: true }).getByText("Password reset", { exact: true }).waitFor();
  assert.equal(issues.find(issue => issue.title === "Password reset").parentId, 5);
  await page.getByRole("button", { name: "Sprint board", exact: true }).click();
  await page.getByRole("combobox", { name: "Sprint board", exact: true }).waitFor();
  assert.equal(await page.locator("article").count(), 3);
  assert.equal(await page.locator("article").filter({ hasText: "Authentication" }).count(), 0);
  await page.getByRole("combobox", { name: "Status for User login", exact: true }).selectOption("IN_PROGRESS");
  await wait(async () => !(await page.getByRole("combobox", { name: "Status for User login", exact: true }).isDisabled()));
  await page.getByRole("button", { name: "Backlog", exact: true }).click();
  const backlog = page.getByRole("region", { name: "Ordered backlog", exact: true });
  assert.equal(await backlog.getByRole("article").count(), 2);
  assert.equal(await backlog.getByText("Test login", { exact: true }).count(), 0);
  currentUserId = 8; await page.reload(); await page.getByRole("button", { name: "Open Board", exact: true }).click(); await page.getByRole("button", { name: "Epics", exact: true }).click();
  await hierarchy.getByText("Test login", { exact: true }).waitFor();
  assert.equal(await hierarchy.getByRole("button", { name: "Create epic", exact: true }).count(), 0);
  assert.equal(await hierarchy.getByRole("button", { name: /^Add subtask/ }).count(), 0);
  await hierarchy.getByRole("button").filter({ hasText: "Test login" }).click();
  assert.equal(await dialog().getByLabel("Parent issue", { exact: true }).isDisabled(), true);
  assert.equal(await dialog().getByLabel("Issue status", { exact: true }).isDisabled(), false);
  assert.equal(await dialog().getByRole("button", { name: "Save changes", exact: true }).count(), 0);
  await dialog().getByRole("heading", { name: /^Discussion/ }).waitFor();
  await dialog().getByLabel("Issue status", { exact: true }).selectOption("IN_PROGRESS");
  await wait(async () => !(await dialog().getByLabel("Issue status", { exact: true }).isDisabled())); await close();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: "tests/board-hierarchy-mobile.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log("Hierarchy browser checks passed: epic/issue/subtask creation, failed-save recovery, progress, reparenting, completion guards, deletion protection, inherited sprint scope, owner/member controls and mobile layout.");
} finally { await browser.close(); }
