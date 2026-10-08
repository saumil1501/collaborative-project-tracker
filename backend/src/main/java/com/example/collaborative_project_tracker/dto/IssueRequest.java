package com.example.collaborative_project_tracker.dto;

import com.example.collaborative_project_tracker.model.*;
import jakarta.validation.constraints.*;
import java.time.LocalDate;

public record IssueRequest(
    @NotBlank @Size(max = 150) String title,
    @Size(max = 2000) String description,
    IssuePriority priority,
    Long assigneeId,
    LocalDate dueDate
) {}