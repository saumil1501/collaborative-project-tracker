package com.example.collaborative_project_tracker.dto;
import com.example.collaborative_project_tracker.model.IssueStatus;
public record DependencyItem(Long id, Long issueId, String issueKey, String title, IssueStatus status) {}
