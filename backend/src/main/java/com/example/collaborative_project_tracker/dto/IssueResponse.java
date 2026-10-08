package com.example.collaborative_project_tracker.dto;

import com.example.collaborative_project_tracker.model.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

public record IssueResponse(
    Long id,
    String title,
    String description,
    IssueStatus status,
    IssuePriority priority,
    Long assigneeId,
    String assigneeName,
    LocalDate dueDate,
    LocalDateTime createdAt
) {}