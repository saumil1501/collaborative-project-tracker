// Notification inbox, navigation, polling and failure recovery using intercepted API responses.
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import assert from "node:assert/strict";
const { chromium } = createRequire(import.meta.url)("playwright");
const browser = await chromium.launch({ headless: true, channel: process.env.BOARD_TEST_BROWSER || "chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = []; page.on("pageerror", error => errors.push(error.message));
await page.clock.install();
const dist = resolve("dist");
await page.route("http://notifications.test/**", async route => {
  const path = new URL(route.request().url()).pathname;
  const file = resolve(dist, path === "/" ? "index.html" : `.${path}`);
  if (!file.startsWith(dist + sep)) return route.fulfill({ status: 403 });
  try { return route.fulfill({ body: await readFile(file), contentType: ({ ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".svg": "image/svg+xml" })[extname(file)] || "application/octet-stream" }); }
  catch { return route.fulfill({ status: 404 }); }
});
const project = { id: 1, name: "Team workspace", description: "Shared project", ownerId: 7, createdAt: "2026-10-09T12:00:00" };
const issue = { id: 1, title: "Review design", description: "Check the layout", status: "TODO", priority: "HIGH", assigneeId: 8, assigneeName: "Alex", dueDate: null, createdAt: "2026-10-09T12:00:00" };
const base = { createdAt: "2026-10-09T12:00:00Z", readAt: null };
let items = [
  { ...base, id: 3, type: "STATUS_CHANGED", message: "Alex moved Review design to done.", projectId: 1, issueId: 1 },
  { ...base, id: 2, type: "LEAVE_REQUESTED", message: "Alex requested permission to leave Team workspace.", projectId: 1, issueId: null },
  { ...base, id: 1, type: "LEAVE_APPROVED", message: "Your request to leave another project was approved.", projectId: null, issueId: null },
];
let failRead = false, failLoad = false, failNavigation = false, inboxRequests = 0;
await page.route("**/api/**", async route => {
  const path = new URL(route.request().url()).pathname, method = route.request().method();
  const reply = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
  if (path.endsWith("/sprints")) return reply([]);
  if (path.endsWith("/csrf")) return reply({ token: "test" });
  if (path.endsWith("/me")) return reply({ id: 7, name: "Sam", email: "sam@example.test" });
  if (path === "/api/notifications") { inboxRequests++; return reply(failLoad ? {} : { items, unreadCount: items.filter(n => !n.readAt).length }, failLoad ? 500 : 200); }
  if (path.startsWith("/api/notifications/") && method === "PATCH") {
    if (failRead) return reply({}, 500);
    const id = Number(path.split("/")[3]);
    for (const item of items) if (path.endsWith("read-all") || item.id === id) item.readAt ||= "2026-10-09T13:00:00Z";
    return route.fulfill({ status: 204 });
  }
  if (path === "/api/projects") return reply([project, { ...project, id: 2, name: "Website refresh", description: "A fresh experience for our customers", ownerId: 8 }, { ...project, id: 3, name: "Product launch", description: "Bring the next release to life" }, { ...project, id: 4, name: "Customer research", description: "Learn what matters to our users", ownerId: 8 }]);
  if (path === "/api/projects/1") return reply(failNavigation ? {} : project, failNavigation ? 404 : 200);
  if (path.endsWith("/members")) return reply([{ userId: 7, name: "Sam", email: "sam@example.test", role: "OWNER" }, { userId: 8, name: "Alex", email: "alex@example.test", role: "MEMBER" }]);
  if (path.endsWith("/issues")) return reply([{ ...issue, status: "DONE" }, { ...issue, id: 2, status: "IN_PROGRESS" }, { ...issue, id: 3, status: "TODO" }]);
  if (path.endsWith("/comments") || path.endsWith("/activity") || path.endsWith("/leave-requests")) return reply([]);
  return reply({}, 404);
});
try {
  await page.goto("http://notifications.test/");
  await page.getByRole("heading", { name: "Website refresh", exact: true }).waitFor();
  await page.getByRole("region", { name: "Completed", exact: true }).getByText("4", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Open Board", exact: true }).count(), 4);
  await page.screenshot({ path: "tests/board-dashboard-desktop.png", fullPage: true });
  await page.getByRole("textbox", { name: "Search projects" }).fill("website");
  assert.equal(await page.getByRole("button", { name: "Open Board", exact: true }).count(), 1);
  await page.getByRole("textbox", { name: "Search projects" }).fill("missing project");
  await page.getByText("No projects match your search.").waitFor();
  await page.getByRole("button", { name: "My projects", exact: true }).click();
  await page.getByRole("heading", { name: "Product launch", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Open Board", exact: true }).count(), 2);
  assert.equal(await page.getByRole("button", { name: /^Delete / }).count(), 2);
  await page.getByRole("button", { name: "Shared with me", exact: true }).click();
  await page.getByRole("heading", { name: "Website refresh", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: /^Delete / }).count(), 0);
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.getByRole("heading", { name: "Product launch", exact: true }).waitFor();
  await page.getByLabel("Show team members").first().click();
  await page.getByRole("textbox", { name: "Member email" }).first().waitFor();
  await page.getByLabel("Show team members").first().click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Mobile page must not overflow");
  await page.screenshot({ path: "tests/board-dashboard-mobile.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log("Dashboard design: summary counts, search, ownership navigation, team expansion and mobile layout passed.");
} finally { await browser.close(); }
