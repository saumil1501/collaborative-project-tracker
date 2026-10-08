package com.example.collaborative_project_tracker.dto;

import com.example.collaborative_project_tracker.model.IssueStatus;
import jakarta.validation.constraints.NotNull;

public record UpdateIssueStatusRequest(
    @NotNull IssueStatus status
) {}