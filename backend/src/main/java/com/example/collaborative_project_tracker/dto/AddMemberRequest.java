package com.example.collaborative_project_tracker.dto;

import jakarta.validation.constraints.*;

public record AddMemberRequest(
    @NotBlank @Email String email
) {}