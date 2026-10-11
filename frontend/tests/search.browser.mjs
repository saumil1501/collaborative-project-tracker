import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import assert from "node:assert/strict";
const { chromium } = createRequire(import.meta.url)("playwright");
const browser = await chromium.launch({ headless: true, channel: process.env.BOARD_TEST_BROWSER || "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = []; page.on("pageerror", error => errors.push(error.message));
const dist = resolve("dist");
await page.route("http://search.test/**", async route => {
  const path = new URL(route.request().url()).pathname;
  const file = resolve(dist, path === "/" ? "index.html" : `.${path}`);
  if (!file.startsWith(dist + sep)) return route.fulfill({ status: 403 });
  try { return route.fulfill({ body: await readFile(file), contentType: ({ ".html": "text/html", ".js": "application/javascript", ".css": "text/css" })[extname(file)] || "application/octet-stream" }); }
  catch { return route.fulfill({ status: 404 }); }
});
const project = { id: 1, name: "Product launch", ownerId: 7, description: "Find and deliver work", createdAt: "2026-10-10T12:00:00" };
const members = [{ userId: 7, name: "Sam Lee", email: "sam@example.test", role: "OWNER" }, { userId: 8, name: "Alex Kim", email: "alex@example.test", role: "MEMBER" }];
let currentUserId = 7, failSearch = false, failSaved = false, failSave = false, nextFilter = 1;
const criteriaRequests = [], saved = [];
const issues = Array.from({ length: 27 }, (_, index) => ({ id: index + 1, title: `Delivery task ${index + 1}`, description: "A trackable step", status: index % 3 === 0 ? "IN_PROGRESS" : "TODO", priority: "HIGH", type: "TASK", assigneeId: index % 2 ? 8 : 7, assigneeName: index % 2 ? "Alex Kim" : "Sam Lee", issueKey: `WEB-${index + 1}`, parentId: null, sprintId: null, storyPoints: 3, labels: ["frontend"], dueDate: "2026-10-01", createdAt: "2026-10-10T12:00:00", planningRank: index + 1 }));
await page.route("**/api/**", async route => {
  const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method();
  const reply = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
  if (path.endsWith("/csrf")) return reply({ token: "test" });
  if (path.endsWith("/me")) { const user = members.find(item => item.userId === currentUserId); return reply({ id: currentUserId, name: user.name, email: user.email }); }
  if (path === "/api/notifications") return reply({ items: [], unreadCount: 0 });
  if (path === "/api/projects") return reply([project]);
  if (path === "/api/projects/1") return reply(project);
  if (path.endsWith("/members")) return reply(members);
  if (path.endsWith("/sprints") || path.endsWith("/comments") || path.endsWith("/activity")) return reply([]);
  if (path.endsWith("/issues")) return reply(issues);
  if (path.endsWith("/issues/search")) {
    const c = Object.fromEntries(url.searchParams); criteriaRequests.push(c);
    if (c.q === "slow") { await new Promise(resolve => setTimeout(resolve, 800)); return reply({ items: [], totalElements: 0, totalPages: 0, page: 0, size: 20 }); }
    if (failSearch) return reply({ detail: "Search temporarily unavailable" }, 500);
    const matches = issues.filter(issue => (!c.q || `${issue.title} ${issue.issueKey}`.toLowerCase().includes(c.q.toLowerCase())) && (!c.status || issue.status === c.status) && (!c.assignee || (c.assignee === "me" ? issue.assigneeId === currentUserId : issue.assigneeId === Number(c.assignee))) && (!c.label || issue.labels.includes(c.label)));
    const page = Number(c.page || 0), size = Number(c.size || 20);
    return reply({ items: matches.slice(page * size, (page + 1) * size), totalElements: matches.length, totalPages: Math.ceil(matches.length / size), page, size });
  }
  if (path.endsWith("/saved-filters") && method === "GET") return reply(failSaved ? {} : saved.filter(filter => filter.userId === currentUserId).map(filter => ({ id: filter.id, name: filter.name, criteria: filter.criteria })), failSaved ? 500 : 200);
  if (path.endsWith("/saved-filters") && method === "POST") {
    if (failSave) return reply({ detail: "Unable to save your filter" }, 500);
    const filter = { ...request.postDataJSON(), id: nextFilter++, userId: currentUserId }; saved.push(filter); return reply(filter, 201);
  }
  const filterId = Number(path.match(/saved-filters\/(\d+)/)?.[1]), filter = saved.find(item => item.id === filterId && item.userId === currentUserId);
  if (filter && method === "PUT") { Object.assign(filter, request.postDataJSON()); return reply(filter); }
  if (filter && method === "DELETE") { saved.splice(saved.indexOf(filter), 1); return route.fulfill({ status: 204 }); }
  return reply({}, 404);
});
const view = () => page.getByRole("region", { name: "Advanced issue search", exact: true });
const results = () => view().getByRole("region", { name: "Search results", exact: true });
const submit = () => view().getByRole("button", { name: "Search issues", exact: true }).click();
try {
  await page.goto("http://search.test/"); await page.getByRole("button", { name: "Open Board", exact: true }).click(); await page.getByRole("button", { name: "Advanced search", exact: true }).click();
  await results().getByRole("heading", { name: "27 matching issues", exact: true }).waitFor();
  assert.equal(await results().getByRole("listitem").count(), 20);
  await results().getByRole("button", { name: "Next page", exact: true }).click(); await results().getByText("Page 2 of 2", { exact: true }).waitFor();
  assert.equal(await results().getByRole("listitem").count(), 7);
  await view().getByLabel("Search assignee", { exact: true }).selectOption("me"); await view().getByLabel("Search status", { exact: true }).selectOption("IN_PROGRESS");
  await view().getByLabel("Exact label", { exact: true }).fill("frontend"); await view().getByLabel("Overdue only", { exact: true }).check(); await submit();
  await results().getByRole("heading", { name: "5 matching issues", exact: true }).waitFor();
  assert.equal(criteriaRequests.at(-1).page, "0"); assert.equal(criteriaRequests.at(-1).overdue, "true");
  await view().getByLabel("Filter name", { exact: true }).fill("My overdue work"); failSave = true;
  await view().getByRole("button", { name: "Save as new filter", exact: true }).click(); await view().getByText("Unable to save your filter", { exact: false }).waitFor();
  assert.equal(await view().getByLabel("Filter name", { exact: true }).inputValue(), "My overdue work"); failSave = false;
  await view().getByRole("button", { name: "Save as new filter", exact: true }).click(); await view().getByText("Personal filter saved.", { exact: true }).waitFor();
  assert.equal(saved[0].criteria.assignee, "me"); assert.equal(saved[0].criteria.overdue, true);
  await view().getByLabel("Filter name", { exact: true }).fill("Current overdue work"); await view().getByRole("button", { name: "Update saved filter", exact: true }).click();
  await view().getByLabel("Your saved filters", { exact: true }).getByRole("option", { name: "Current overdue work", exact: true }).waitFor({ state: "attached" });
  await view().getByRole("button", { name: "Reset search", exact: true }).click(); await results().getByRole("heading", { name: "27 matching issues", exact: true }).waitFor();
  await view().getByLabel("Your saved filters", { exact: true }).selectOption("1"); await results().getByRole("heading", { name: "5 matching issues", exact: true }).waitFor();
  await page.screenshot({ path: "tests/board-search-desktop.png", fullPage: true });
  await view().getByRole("button", { name: "Delete saved filter", exact: true }).click(); await view().getByRole("button", { name: "Keep filter", exact: true }).click(); assert.equal(saved.length, 1);
  await view().getByRole("button", { name: "Delete saved filter", exact: true }).click(); await view().getByRole("button", { name: "Confirm filter deletion", exact: true }).click();
  await view().getByText("Personal filter deleted. Your current search is unchanged.", { exact: true }).waitFor(); assert.equal(saved.length, 0);
  await view().getByRole("button", { name: "Reset search", exact: true }).click(); await results().getByRole("heading", { name: "27 matching issues", exact: true }).waitFor();
  await view().getByLabel("Text or issue key", { exact: true }).fill("WEB-27"); failSearch = true; await submit(); await view().getByText("Search temporarily unavailable", { exact: false }).waitFor();
  failSearch = false; await view().getByRole("button", { name: "Retry search", exact: true }).click(); await results().getByRole("heading", { name: "1 matching issues", exact: true }).waitFor();
  await results().getByRole("button").filter({ hasText: "Delivery task 27" }).click(); await page.getByRole("dialog", { name: "Issue details", exact: true }).waitFor(); await page.getByRole("button", { name: "Close issue details", exact: true }).click();
  await view().getByLabel("Text or issue key", { exact: true }).fill("slow"); await submit(); await view().getByLabel("Text or issue key", { exact: true }).fill("WEB-27"); await submit();
  await results().getByRole("heading", { name: "1 matching issues", exact: true }).waitFor(); await page.waitForTimeout(1000);
  assert.equal(await results().getByRole("listitem").count(), 1, "Stale slow responses must not replace newer results");
  currentUserId = 8; failSaved = true; await page.reload(); await page.getByRole("button", { name: "Open Board", exact: true }).click(); await page.getByRole("button", { name: "Advanced search", exact: true }).click();
  await view().getByText("We couldn't load your saved filters.", { exact: false }).waitFor(); failSaved = false; await view().getByRole("button", { name: "Retry saved filters", exact: true }).click();
  await view().getByLabel("Your saved filters", { exact: true }).getByRole("option", { name: "Choose a personal filter", exact: true }).waitFor({ state: "attached" });
  await view().getByLabel("Search assignee", { exact: true }).selectOption("me"); await submit(); await results().getByRole("heading", { name: "13 matching issues", exact: true }).waitFor();
  await results().getByRole("button").first().click(); assert.equal(await page.getByRole("dialog").getByLabel(/^Title/).isDisabled(), true); await page.getByRole("button", { name: "Close issue details", exact: true }).click();
  await view().getByLabel("Filter name", { exact: true }).fill("My assigned work"); await view().getByRole("button", { name: "Save as new filter", exact: true }).click(); await view().getByText("Personal filter saved.", { exact: true }).waitFor(); assert.equal(saved[0].userId, 8);
  await page.setViewportSize({ width: 390, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: "tests/board-search-mobile.png", fullPage: true }); assert.deepEqual(errors, []);
  console.log("Advanced search browser checks passed: combined criteria, pagination, saved filter create/update/apply/delete, member privacy, failed-load/save recovery, issue details, stale-response protection and mobile layout.");
} finally { await browser.close(); }
