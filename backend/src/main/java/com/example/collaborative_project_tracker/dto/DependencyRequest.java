package com.example.collaborative_project_tracker.dto;
import jakarta.validation.constraints.*;
public record DependencyRequest(@NotNull @Positive Long targetId,@NotNull @Pattern(regexp="BLOCKED_BY|BLOCKS") String direction) {}
