import test from "node:test";
import assert from "node:assert/strict";
import { canChangeIssueStatus, canManageIssues, filterIssues, initials, isOverdue, summarizeIssues, orderedBacklog } from "../src/utils/board.ts";

const today = new Date(2026, 9, 9, 23, 59);
const base = { id: 1, title: "Review design", description: null, status: "TODO", priority: "HIGH", assigneeId: 7, assigneeName: "Sam Lee", dueDate: "2026-10-09", createdAt: "2026-10-01T12:00:00" };
const issues = [base, { ...base, id: 2, title: "Ship board", status: "DONE", dueDate: "2026-10-01", assigneeId: 8 }, { ...base, id: 3, title: "Write notes", dueDate: "2026-10-08", priority: "LOW", assigneeId: null }];
const filters = { query: "", priority: "", assignee: "", mineOnly: false, currentUserId: 7 };

test("only project owners can manage issues", () => {
  assert.equal(canManageIssues("OWNER"), true);
  assert.equal(canManageIssues("MEMBER"), false);
  assert.equal(canManageIssues(undefined), false);
});

test("status allows owners and current member assignees only", () => {
  assert.equal(canChangeIssueStatus(base, 8, "OWNER"), true);
  assert.equal(canChangeIssueStatus(issues[2], 8, "OWNER"), true);
  assert.equal(canChangeIssueStatus(base, 7, "MEMBER"), true);
  assert.equal(canChangeIssueStatus(base, 8, "MEMBER"), false);
  assert.equal(canChangeIssueStatus(issues[2], 7, "MEMBER"), false);
  assert.equal(canChangeIssueStatus(base, 7, undefined), false);
  assert.equal(canChangeIssueStatus({ ...base, assigneeId: 8 }, 7, "MEMBER"), false);
});

test("due today remains on time; only unfinished issues before today are overdue", () => {
  assert.equal(isOverdue(base, today), false);
  assert.equal(isOverdue(issues[1], today), false);
  assert.equal(isOverdue(issues[2], today), true);
  assert.equal(isOverdue({ ...base, dueDate: null }, today), false);
  assert.equal(isOverdue({ ...base, dueDate: "2026-10-10" }, today), false);
});
test("search is case insensitive and combines with assignee and priority", () => {
  assert.deepEqual(filterIssues(issues, { ...filters, query: " REVIEW ", priority: "HIGH", assignee: "7" }).map(issue => issue.id), [1]);
  assert.equal(filterIssues(issues, { ...filters, query: "review", priority: "LOW" }).length, 0);
});
test("unassigned and assigned-to-me filters have distinct, intersecting semantics", () => {
  assert.deepEqual(filterIssues(issues, { ...filters, assignee: "unassigned" }).map(issue => issue.id), [3]);
  assert.deepEqual(filterIssues(issues, { ...filters, mineOnly: true }).map(issue => issue.id), [1]);
  assert.equal(filterIssues(issues, { ...filters, mineOnly: true, assignee: "8" }).length, 0);
  assert.deepEqual(filterIssues(issues, filters), issues);
});
test("summary counts completed issues and excludes them from overdue counts", () => {
  assert.deepEqual(summarizeIssues(issues, today), { total: 3, completed: 1, overdue: 1 });
  assert.deepEqual(summarizeIssues([], today), { total: 0, completed: 0, overdue: 0 });
});
test("avatar initials handle whitespace, single names, and unassigned issues", () => {
  assert.equal(initials(" Sam   Lee "), "SL");
  assert.equal(initials("Sam"), "S");
  assert.equal(initials(null), "—");
  assert.equal(initials("   "), "—");
});

test("backlog preserves in-progress work, excludes done and sprint issues, and orders legacy rows without mutating input", () => {
  const source = [{ ...base, id: 12, sprintId: null, planningRank: 1 }, { ...base, id: 5, status: "IN_PROGRESS" }, { ...base, id: 6, status: "DONE" }, { ...base, id: 7, sprintId: 10 }, { ...base, id: 2, sprintId: null, planningRank: 1 }];
  assert.deepEqual(orderedBacklog(source).map(issue => issue.id), [2, 12, 5]);
  assert.deepEqual(source.map(issue => issue.id), [12, 5, 6, 7, 2]);
});
