// Mock API checks against local build files; no running server or database required.
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import assert from "node:assert/strict";
const { chromium } = createRequire(import.meta.url)("playwright");
const browser = await chromium.launch({ headless: true, channel: process.env.BOARD_TEST_BROWSER || "chrome" });
const dist = resolve("dist");
let project = { id: 1, name: "Team workspace", description: "A shared project", ownerId: 7, createdAt: "2026-10-09T12:00:00" };
let members = [{ userId: 7, name: "Sam Lee", email: "sam@example.test", role: "OWNER" }, { userId: 8, name: "Alex Kim", email: "alex@example.test", role: "MEMBER" }, { userId: 9, name: "Taylor", email: "taylor@example.test", role: "MEMBER" }];
let requests = [];
let failSave = false;
const issues = [{ id: 1, title: "Assigned task", description: null, status: "TODO", priority: "HIGH", assigneeId: 8, assigneeName: "Alex Kim", dueDate: null, createdAt: "2026-10-09T12:00:00" }];
const errors = [];
async function newPage(userId, viewport = { width: 1280, height: 900 }) {
  const page = await browser.newPage({ viewport });
  page.on("pageerror", error => errors.push(error.message));
  await page.route("http://settings.test/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const file = resolve(dist, path === "/" ? "index.html" : `.${path}`);
    if (!file.startsWith(dist + sep)) return route.fulfill({ status: 403 });
    try { await route.fulfill({ body: await readFile(file), contentType: ({ ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".svg": "image/svg+xml" })[extname(file)] || "application/octet-stream" }); }
    catch { await route.fulfill({ status: 404 }); }
  });
  await page.route("**/api/**", async route => {
    const method = route.request().method(); const path = new URL(route.request().url()).pathname;
    const reply = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    if (path.endsWith("/csrf")) return reply({ token: "test" });
    if (path.endsWith("/me")) return reply({ id: userId, name: userId === 7 ? "Sam Lee" : "Alex Kim", email: "test@example.test" });
    if (path === "/api/projects") return reply(members.some(member => member.userId === userId) ? [project] : []);
    if (path === "/api/projects/1" && method === "PUT") { if (failSave) return reply({}, 500); project = { ...project, ...route.request().postDataJSON() }; return reply(project); }
    if (path === "/api/projects/1") return reply(project);
    if (path.endsWith("/members") && method === "GET") return reply(members);
    if (path.endsWith("/issues")) return reply(issues);
    if (path.endsWith("/members/9") && method === "DELETE") { members = members.filter(member => member.userId !== 9); return route.fulfill({ status: 204 }); }
    if (path.endsWith("/leave-requests") && method === "GET") return reply(userId === 7 ? requests : requests.filter(request => request.userId === userId));
    if (path.endsWith("/leave-requests") && method === "POST") {
      const request = { id: 20, userId: 8, name: "Alex Kim", status: "PENDING", requestedAt: "2026-10-09T12:00:00Z", resolvedAt: null };
      requests = [request]; return reply(request, 201);
    }
    if (path.includes("/leave-requests/20/") && method === "PATCH") {
      const decision = path.split("/").at(-1); const request = requests[0];
      request.status = ({ approve: "APPROVED", reject: "REJECTED", cancel: "CANCELLED" })[decision];
      if (decision === "approve") { members = members.filter(member => member.userId !== 8); issues[0].assigneeId = null; issues[0].assigneeName = null; }
      return reply(request);
    }
    return reply({}, 404);
  });
  await page.goto("http://settings.test/");
  await page.getByRole("button", { name: "Open Board" }).click();
  await page.getByRole("button", { name: "Project settings", exact: true }).click();
  await page.getByRole("region", { name: "Project details" }).waitFor();
  return page;
}
try {
  const member = await newPage(8, { width: 390, height: 844 });
  assert.equal(await member.getByRole("button", { name: "Save project details" }).count(), 0);
  assert.equal(await member.getByRole("button", { name: /Approve leave|Reject leave|^Remove / }).count(), 0);
  await member.getByRole("button", { name: "Request permission to leave" }).click();
  await member.getByRole("button", { name: "Cancel leave request" }).waitFor();
  assert.equal(members.some(item => item.userId === 8), true);
  assert.equal(issues[0].assigneeId, 8);
  await member.getByRole("button", { name: "Cancel leave request" }).click();
  await member.getByRole("button", { name: "Request to leave again" }).click();
  await member.getByRole("button", { name: "Cancel leave request" }).waitFor();
  await member.screenshot({ path: "tests/board-settings-member.png" });
  const owner = await newPage(7);
  assert.equal(await owner.getByRole("button", { name: /Request permission to leave|Cancel leave request/ }).count(), 0);
  assert.equal(await owner.getByRole("button", { name: "Remove Sam Lee" }).count(), 0);
  await owner.getByRole("textbox", { name: "Project name", exact: true }).fill("Updated workspace");
  failSave = true;
  await owner.getByRole("button", { name: "Save project details" }).click();
  await owner.getByRole("alert").waitFor();
  assert.equal(await owner.getByRole("textbox", { name: "Project name", exact: true }).inputValue(), "Updated workspace");
  failSave = false;
  await owner.getByRole("button", { name: "Save project details" }).click();
  await owner.getByText("Project details saved.", { exact: true }).waitFor();
  assert.equal(project.name, "Updated workspace");
  await owner.getByRole("button", { name: "Reject leave", exact: true }).click();
  await owner.getByText("Request rejected. Access and assignments remain.", { exact: true }).waitFor();
  assert.equal(members.some(item => item.userId === 8), true); assert.equal(issues[0].assigneeId, 8);
  await member.getByRole("button", { name: "Close project settings" }).click();
  await member.getByRole("button", { name: "Project settings", exact: true }).click();
  await member.getByRole("button", { name: "Request to leave again" }).click();
  await member.getByRole("button", { name: "Cancel leave request" }).waitFor();
  await owner.getByRole("button", { name: "Close project settings" }).click();
  await owner.getByRole("button", { name: "Project settings", exact: true }).click();
  await owner.getByRole("button", { name: "Approve leave", exact: true }).click();
  await owner.getByText("Leave approved. The member's issues are now unassigned.", { exact: true }).waitFor();
  assert.equal(members.some(item => item.userId === 8), false); assert.equal(issues[0].assigneeId, null);
  await owner.getByRole("button", { name: "Remove Taylor", exact: true }).click();
  await owner.getByRole("button", { name: "Keep member" }).click();
  await owner.getByRole("button", { name: "Remove Taylor", exact: true }).click();
  await owner.getByRole("button", { name: "Confirm removal" }).click();
  await owner.getByText("Member removed. Their issues are now unassigned.", { exact: true }).waitFor();
  assert.equal(members.length, 1);
  await owner.screenshot({ path: "tests/board-settings-owner.png" });
  await owner.getByRole("button", { name: "Close project settings" }).click();
  await owner.getByRole("heading", { name: "Updated workspace", exact: true }).waitFor();
  await member.reload();
  await member.getByText("No projects yet", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log("Project settings browser checks passed: owner/member controls, edit and recovery, request/cancel/resubmit/reject/approve, removal confirmation, unassignment refresh, and access loss.");
} finally { await browser.close(); }
