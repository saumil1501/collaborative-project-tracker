package com.example.collaborative_project_tracker.dto;

import com.example.collaborative_project_tracker.model.LeaveRequestStatus;
import java.time.Instant;

public record LeaveRequestResponse(Long id, Long userId, String name, String email,
                                   LeaveRequestStatus status, Instant requestedAt, Instant resolvedAt) {}
