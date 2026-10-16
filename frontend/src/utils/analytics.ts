import type { Priority, Status } from "./board";

export type Metrics = {
  total: number; todo: number; inProgress: number; done: number; estimatedIssues: number;
  totalPoints: number; completedPoints: number; overdue: number | null; blocked: number | null;
};
export type SprintAnalytics = {
  id: number; name: string; goal: string | null; status: "PLANNED" | "ACTIVE" | "COMPLETED";
  startDate: string; endDate: string; startedAt: string | null; completedAt: string | null;
  committedIssues: number | null; committedPoints: number | null;
  netIssueChange: number | null; netPointChange: number | null; metrics: Metrics;
};
export type Analytics = {
  generatedAt: string; asOfDate: string; project: Metrics; epicCount: number; subtaskCount: number;
  backlogIssues: number; types: { type: string; total: number; done: number }[];
  workload: { userId: number | null; name: string; metrics: Metrics }[];
  attentionTotal: number;
  attention: { issueId: number; issueKey: string; title: string; status: Status; priority: Priority;
    assigneeName: string | null; dueDate: string | null; overdue: boolean; blockers: string[] }[];
  sprints: SprintAnalytics[];
  trend: { completedSprints: number; sampleSize: number; averageCompletedIssues: number | null;
    averageCompletedPoints: number | null; recentSprintIds: number[] };
};
