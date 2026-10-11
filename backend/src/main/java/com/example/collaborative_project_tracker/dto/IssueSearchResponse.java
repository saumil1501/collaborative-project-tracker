package com.example.collaborative_project_tracker.dto;
import java.util.List;
public record IssueSearchResponse(List<IssueResponse> items, long totalElements, int totalPages, int page, int size) {}
