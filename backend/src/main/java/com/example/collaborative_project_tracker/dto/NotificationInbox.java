package com.example.collaborative_project_tracker.dto;

import java.util.List;

public record NotificationInbox(List<NotificationResponse> items, long unreadCount) {}
