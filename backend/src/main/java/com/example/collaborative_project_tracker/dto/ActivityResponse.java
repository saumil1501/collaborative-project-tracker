package com.example.collaborative_project_tracker.dto;

import com.example.collaborative_project_tracker.model.ActivityField;
import java.time.Instant;

public record ActivityResponse(Long id, Long actorId, String actorName, ActivityField field,
                               String oldValue, String newValue, Instant createdAt) {}
