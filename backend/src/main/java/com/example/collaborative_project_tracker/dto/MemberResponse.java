package com.example.collaborative_project_tracker.dto;

public record MemberResponse(
    Long userId,
    String name,
    String email,
    String role
) {}