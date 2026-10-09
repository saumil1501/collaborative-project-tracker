package com.example.collaborative_project_tracker.dto;

import com.example.collaborative_project_tracker.model.NotificationType;
import java.time.Instant;

public record NotificationResponse(Long id, NotificationType type, String message,
        Long projectId, Long issueId, Instant createdAt, Instant readAt) {}
