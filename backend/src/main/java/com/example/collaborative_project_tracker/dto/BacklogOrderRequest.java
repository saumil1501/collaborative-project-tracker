package com.example.collaborative_project_tracker.dto;
import jakarta.validation.constraints.*;
import java.util.List;
public record BacklogOrderRequest(@NotNull List<@NotNull @Positive Long> issueIds) {}
