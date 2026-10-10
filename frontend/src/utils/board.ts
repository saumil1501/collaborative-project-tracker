export type Status = "TODO" | "IN_PROGRESS" | "DONE";
export type Priority = "LOW" | "MEDIUM" | "HIGH";
export type IssueType = "BUG" | "TASK" | "STORY" | "EPIC" | "SUBTASK";
export type Issue = {
  id: number; title: string; description: string | null; status: Status;
  priority: Priority; assigneeId: number | null; assigneeName: string | null;
  dueDate: string | null; createdAt: string;
  sprintId?: number | null; planningRank?: number; issueKey?: string; type?: IssueType; parentId?: number | null; parentKey?: string | null; storyPoints?: number | null; labels?: string[];
};

export function canManageIssues(memberRole: string | undefined) {
  return memberRole === "OWNER";
}

export function canChangeIssueStatus(issue: Issue, currentUserId: number, memberRole: string | undefined) {
  return canManageIssues(memberRole) || (memberRole === "MEMBER" && issue.assigneeId === currentUserId);
}

// Compare calendar dates, so an issue due today remains on time all day.
export function isOverdue(issue: Issue, today = new Date()) {
  const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return issue.status !== "DONE" && Boolean(issue.dueDate && issue.dueDate < localDate);
}

export function initials(name: string | null) {
  return name?.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "—";
}

export function filterIssues(issues: Issue[], filters: {
  query: string; priority: string; assignee: string; mineOnly: boolean; currentUserId: number;
}) {
  return issues.filter(issue =>
    ` ${issue.title} ${issue.issueKey || ""} ${(issue.labels || []).join(" ")}`.toLowerCase().includes(filters.query.trim().toLowerCase()) &&
    (!filters.priority || issue.priority === filters.priority) &&
    (!filters.assignee || (filters.assignee === "unassigned" ? issue.assigneeId === null : issue.assigneeId === Number(filters.assignee))) &&
    (!filters.mineOnly || issue.assigneeId === filters.currentUserId)
  );
}

export function summarizeIssues(issues: Issue[], today = new Date()) {
  return { total: issues.length, completed: issues.filter(issue => issue.status === "DONE").length, overdue: issues.filter(issue => isOverdue(issue, today)).length };
}

export type Sprint = {
  id: number; name: string; goal: string | null; startDate: string; endDate: string;
  status: "PLANNED" | "ACTIVE" | "COMPLETED"; startedAt: string | null; completedAt: string | null;
  committedIssueCount: number | null; committedPoints: number | null;
  snapshots: { issueId: number; issueKey: string; title: string; status: Status; storyPoints: number | null; assigneeName: string | null }[];
};

export function orderedBacklog(issues: Issue[]) {
  return issues.filter(issue => isPlannable(issue) && issue.sprintId == null && issue.status !== "DONE")
    .sort((left, right) => (left.planningRank ?? left.id) - (right.planningRank ?? right.id) || left.id - right.id);
}

export function isPlannable(issue: Issue) {
  return issue.type !== "EPIC" && issue.type !== "SUBTASK";
}

// Count direct children only: a story and its subtasks must not count twice.
export function childProgress(parentId: number, issues: Issue[]) {
  const children = issues.filter(issue => issue.parentId === parentId);
  const done = children.filter(issue => issue.status === "DONE").length;
  return { total: children.length, done, percent: children.length ? Math.round(done * 100 / children.length) : 0,
    points: children.reduce((sum, issue) => sum + (issue.storyPoints || 0), 0),
    completedPoints: children.filter(issue => issue.status === "DONE").reduce((sum, issue) => sum + (issue.storyPoints || 0), 0) };
}
