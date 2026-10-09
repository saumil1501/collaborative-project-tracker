export type Status = "TODO" | "IN_PROGRESS" | "DONE";
export type Priority = "LOW" | "MEDIUM" | "HIGH";
export type Issue = {
  id: number; title: string; description: string | null; status: Status;
  priority: Priority; assigneeId: number | null; assigneeName: string | null;
  dueDate: string | null; createdAt: string;
};

export function canChangeIssueStatus(issue: Issue, currentUserId: number, memberRole: string | undefined) {
  return memberRole === "OWNER" || (memberRole === "MEMBER" && issue.assigneeId === currentUserId);
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
    issue.title.toLowerCase().includes(filters.query.trim().toLowerCase()) &&
    (!filters.priority || issue.priority === filters.priority) &&
    (!filters.assignee || (filters.assignee === "unassigned" ? issue.assigneeId === null : issue.assigneeId === Number(filters.assignee))) &&
    (!filters.mineOnly || issue.assigneeId === filters.currentUserId)
  );
}

export function summarizeIssues(issues: Issue[], today = new Date()) {
  return { total: issues.length, completed: issues.filter(issue => issue.status === "DONE").length, overdue: issues.filter(issue => isOverdue(issue, today)).length };
}
