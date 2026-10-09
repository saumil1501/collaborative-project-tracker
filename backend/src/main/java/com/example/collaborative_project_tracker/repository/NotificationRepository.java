package com.example.collaborative_project_tracker.repository;

import com.example.collaborative_project_tracker.model.Notification;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.domain.Pageable;
import org.springframework.data.repository.query.Param;
import java.time.Instant;
import java.util.*;

public interface NotificationRepository extends JpaRepository<Notification, Long> {
    List<Notification> findByRecipientIdOrderByCreatedAtDescIdDesc(Long recipientId, Pageable page);
    long countByRecipientIdAndReadAtIsNull(Long recipientId);
    Optional<Notification> findByIdAndRecipientId(Long id, Long recipientId);
    @Modifying
    @Query("update Notification n set n.readAt = :now where n.recipient.id = :recipientId and n.readAt is null")
    int markAllRead(@Param("recipientId") Long recipientId, @Param("now") Instant now);
}
