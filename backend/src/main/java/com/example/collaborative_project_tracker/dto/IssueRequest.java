package com.example.collaborative_project_tracker.dto;

import com.example.collaborative_project_tracker.model.*;
import jakarta.validation.constraints.*;
import java.time.LocalDate;

public record IssueRequest(
    @NotBlank @Size(max = 150) String title,
    @Size(max = 2000) String description,
    IssuePriority priority,
    Long assigneeId,
    LocalDate dueDate,
    IssueType type,
    Integer storyPoints,
    @Size(max = 10) java.util.List<@NotBlank @Size(max = 30) @Pattern(regexp = "[a-zA-Z0-9][a-zA-Z0-9_-]*") String> labels,
    @Positive Long parentId
) {
    public IssueRequest(String title, String description, IssuePriority priority, Long assigneeId, LocalDate dueDate, IssueType type, Integer storyPoints, java.util.List<String> labels) {
        this(title, description, priority, assigneeId, dueDate, type, storyPoints, labels, null);
    }
    public IssueRequest(String title, String description, IssuePriority priority, Long assigneeId, LocalDate dueDate) {
        this(title, description, priority, assigneeId, dueDate, null, null, null);
    }
}