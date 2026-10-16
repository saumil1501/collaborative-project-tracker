package com.example.collaborative_project_tracker.dto;

import com.example.collaborative_project_tracker.model.*;
import java.time.*;
import java.util.List;

public record AnalyticsResponse(Instant generatedAt, LocalDate asOfDate, Metrics project, int epicCount,
        int subtaskCount, int backlogIssues, List<TypeCount> types, List<Workload> workload,
        int attentionTotal, List<Attention> attention, List<SprintAnalytics> sprints, Trend trend) {
    // Historical snapshots do not contain due dates or blocker state; null means unavailable.
    public record Metrics(int total, int todo, int inProgress, int done, int estimatedIssues,
                          int totalPoints, int completedPoints, Integer overdue, Integer blocked) {}
    public record TypeCount(IssueType type, int total, int done) {}
    public record Workload(Long userId, String name, Metrics metrics) {}
    public record Attention(Long issueId, String issueKey, String title, IssueStatus status,
                            IssuePriority priority, String assigneeName, LocalDate dueDate,
                            boolean overdue, List<String> blockers) {}
    public record SprintAnalytics(Long id, String name, String goal, SprintStatus status,
            LocalDate startDate, LocalDate endDate, Instant startedAt, Instant completedAt,
            Integer committedIssues, Integer committedPoints, Integer netIssueChange,
            Integer netPointChange, Metrics metrics) {}
    public record Trend(int completedSprints, int sampleSize, Double averageCompletedIssues,
                        Double averageCompletedPoints, List<Long> recentSprintIds) {}
}
