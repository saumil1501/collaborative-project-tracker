package com.example.collaborative_project_tracker.dto;
import com.example.collaborative_project_tracker.model.*;
import java.time.*;
import java.util.List;
public record SprintResponse(Long id, String name, String goal, LocalDate startDate, LocalDate endDate,
    SprintStatus status, Instant startedAt, Instant completedAt, Integer committedIssueCount, Integer committedPoints,
    List<Snapshot> snapshots) {
    public record Snapshot(Long issueId, String issueKey, String title, IssueStatus status, Integer storyPoints, String assigneeName) {}
}
