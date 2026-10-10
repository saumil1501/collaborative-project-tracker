package com.example.collaborative_project_tracker.dto;
import jakarta.validation.constraints.Positive;
public record MoveIssueSprintRequest(@Positive Long sprintId) {}
