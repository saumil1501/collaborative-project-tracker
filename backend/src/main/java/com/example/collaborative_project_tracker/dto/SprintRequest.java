package com.example.collaborative_project_tracker.dto;
import jakarta.validation.constraints.*;
import java.time.LocalDate;
public record SprintRequest(@NotBlank @Size(max = 150) String name, @Size(max = 1000) String goal,
                            @NotNull LocalDate startDate, @NotNull LocalDate endDate) {}
