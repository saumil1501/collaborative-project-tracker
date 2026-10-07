package com.example.collaborative_project_tracker.dto;

public record UserResponse(
        Long id,
        String name,
        String email
) {}