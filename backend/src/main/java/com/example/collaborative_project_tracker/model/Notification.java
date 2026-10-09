package com.example.collaborative_project_tracker.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;

@Entity
@Table(name = "notifications", indexes = @Index(name = "idx_notification_recipient_created", columnList = "recipient_id,created_at"))
@Getter @Setter @NoArgsConstructor
public class Notification {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "recipient_id", nullable = false, updatable = false)
    private AppUser recipient;
    @Enumerated(EnumType.STRING) @Column(nullable = false, updatable = false)
    private NotificationType type;
    @Column(nullable = false, length = 500, updatable = false)
    private String message;
    // Keep historical notifications when a target is deleted. Access is checked when reading the inbox.
    @Column(nullable = false, updatable = false)
    private Long projectId;
    @Column(updatable = false)
    private Long issueId;
    @Column(nullable = false, updatable = false)
    private Instant createdAt;
    private Instant readAt;
    @PrePersist void onCreate() { createdAt = Instant.now(); }
}
