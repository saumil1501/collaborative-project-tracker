package com.example.collaborative_project_tracker.dto;

import java.time.Instant;

public record CommentResponse(Long id, Long authorId, String authorName, String body,
                              Instant createdAt, Instant editedAt) {}
