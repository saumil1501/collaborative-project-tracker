package com.example.collaborative_project_tracker.dto;
import jakarta.validation.constraints.*;
public record SavedFilterRequest(@NotBlank @Size(max=80) String name, @NotNull IssueSearchRequest criteria) {}
