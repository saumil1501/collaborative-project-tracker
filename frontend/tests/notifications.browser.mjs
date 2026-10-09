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
  if (path.endsWith("/csrf")) return reply({ token: "test" });
  if (path.endsWith("/me")) return reply({ id: 7, name: "Sam", email: "sam@example.test" });
  if (path === "/api/notifications") { inboxRequests++; return reply(failLoad ? {} : { items, unreadCount: items.filter(n => !n.readAt).length }, failLoad ? 500 : 200); }
  if (path.startsWith("/api/notifications/") && method === "PATCH") {
    if (failRead) return reply({}, 500);
    const id = Number(path.split("/")[3]);
    for (const item of items) if (path.endsWith("read-all") || item.id === id) item.readAt ||= "2026-10-09T13:00:00Z";
    return route.fulfill({ status: 204 });
  }
  if (path === "/api/projects") return reply([project]);
  if (path === "/api/projects/1") return reply(failNavigation ? {} : project, failNavigation ? 404 : 200);
  if (path.endsWith("/members")) return reply([{ userId: 7, name: "Sam", email: "sam@example.test", role: "OWNER" }, { userId: 8, name: "Alex", email: "alex@example.test", role: "MEMBER" }]);
  if (path.endsWith("/issues")) return reply([issue]);
  if (path.endsWith("/comments") || path.endsWith("/activity") || path.endsWith("/leave-requests")) return reply([]);
  return reply({}, 404);
});
try {
  await page.goto("http://notifications.test/");
  await page.getByRole("button", { name: "Notifications, 3 unread", exact: true }).click();
  let panel = page.getByRole("dialog", { name: "Notifications", exact: true });
  await panel.getByText(items[0].message, { exact: true }).waitFor();
  assert.equal(await panel.getByRole("article", { name: "Unread notification", exact: true }).count(), 3);
  const inaccessible = panel.getByRole("article").filter({ hasText: items[2].message });
  assert.equal(await inaccessible.getByRole("button", { name: /Open/ }).count(), 0);
  const first = panel.getByRole("article").filter({ hasText: items[0].message });
  failRead = true;
  await first.getByRole("button", { name: "Mark as read", exact: true }).click();
  await panel.getByRole("alert").waitFor();
  assert.equal(items[0].readAt, null);
  failRead = false;
  await first.getByRole("button", { name: "Mark as read", exact: true }).click();
  await panel.getByText("2 unread", { exact: true }).waitFor();
  await first.getByRole("button", { name: "Open issue", exact: true }).click();
  const details = page.getByRole("dialog", { name: "Issue details", exact: true });
  await details.waitFor();
  assert.equal(await details.getByRole("textbox", { name: /^Title/ }).inputValue(), "Review design");
  await details.getByRole("button", { name: "Close issue details" }).click();
  await page.getByRole("button", { name: "All projects" }).click();
  await page.getByRole("button", { name: "Open Board" }).click();
  await page.getByRole("button", { name: /Review design/ }).waitFor();
  assert.equal(await page.getByRole("dialog").count(), 0);
  await page.getByRole("button", { name: /^Notifications/ }).click();
  panel = page.getByRole("dialog", { name: "Notifications", exact: true });
  await panel.getByRole("button", { name: "Open project settings", exact: true }).click();
  await page.getByRole("dialog", { name: "Project settings", exact: true }).waitFor();
  await page.getByRole("textbox", { name: "Project name", exact: true }).waitFor();
  await page.getByRole("button", { name: "Close project settings" }).click();
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await panel.getByRole("button", { name: "Mark all as read", exact: true }).click();
  await panel.getByText("0 unread", { exact: true }).waitFor();
  const beforePolling = inboxRequests;
  items.unshift({ ...base, id: 4, type: "COMMENT_ADDED", message: "Alex commented on Review design.", projectId: 1, issueId: 1 });
  await page.clock.fastForward(31000);
  await panel.getByText(items[0].message, { exact: true }).waitFor();
  assert.ok(inboxRequests > beforePolling);
  await panel.getByText("1 unread", { exact: true }).waitFor();
  failLoad = true;
  await page.clock.fastForward(31000);
  await panel.getByRole("alert").waitFor();
  assert.equal(await panel.getByText(items[0].message, { exact: true }).count(), 1);
  failLoad = false;
  await panel.getByRole("button", { name: "Retry notifications" }).click();
  await page.waitForFunction(() => !document.querySelector('dialog [role="alert"]'));
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: "tests/board-notifications.png", fullPage: true });
  failNavigation = true;
  await panel.getByRole("article").filter({ hasText: items[0].message }).getByRole("button", { name: "Open issue", exact: true }).click();
  await page.getByText("This project is no longer available to you.", { exact: true }).waitFor();
  failNavigation = false;
  await page.getByRole("button", { name: "Open Board" }).click();
  await page.getByRole("button", { name: /Review design/ }).waitFor();
  assert.equal(await page.getByRole("dialog").count(), 0);
  await page.getByRole("button", { name: /^Notifications/ }).click();
  items = [];
  await page.clock.fastForward(31000);
  await panel.getByText(/You're all caught up/).waitFor();
  await page.getByRole("button", { name: "Close notifications" }).click();
  assert.deepEqual(errors, []);
  console.log("Notifications browser checks passed: unread counts, read failure recovery, issue/settings navigation, access-safe links, periodic refresh, polling error recovery, empty inbox and mobile layout.");
} catch (error) {
  await page.screenshot({ path: "tests/board-notifications-failure.png", fullPage: true });
  console.error("Page errors:", errors);
  throw error;
} finally { await browser.close(); }
