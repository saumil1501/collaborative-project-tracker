package com.example.collaborative_project_tracker.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateProjectRequest(
        @NotBlank @Size(max = 150) String name,
        @Size(max = 1000) String description,
        @jakarta.validation.constraints.Pattern(regexp = "[A-Z]{2,10}", message = "Key must contain 2-10 uppercase letters") String projectKey
) {
    public CreateProjectRequest(String name, String description) { this(name, description, null); }
}