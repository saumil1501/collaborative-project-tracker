package com.example.collaborative_project_tracker.dto;
import java.time.LocalDate;
public record IssueSearchRequest(String q, String status, String type, String priority, String assignee,
    Long epicId, String sprint, String label, Boolean overdue, @org.springframework.format.annotation.DateTimeFormat(iso=org.springframework.format.annotation.DateTimeFormat.ISO.DATE) LocalDate dueFrom, @org.springframework.format.annotation.DateTimeFormat(iso=org.springframework.format.annotation.DateTimeFormat.ISO.DATE) LocalDate dueTo,
    String sort, Integer page, Integer size) {}
