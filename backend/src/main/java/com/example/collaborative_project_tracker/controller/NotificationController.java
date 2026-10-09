package com.example.collaborative_project_tracker.controller;

import com.example.collaborative_project_tracker.dto.NotificationInbox;
import com.example.collaborative_project_tracker.service.NotificationService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.security.Principal;

@RestController
@RequestMapping("/api/notifications")
public class NotificationController {
    private final NotificationService service;
    public NotificationController(NotificationService service) { this.service = service; }
    @GetMapping public NotificationInbox inbox(Principal principal) { return service.inbox(principal.getName()); }
    @PatchMapping("/{id}/read") public ResponseEntity<Void> markRead(@PathVariable Long id, Principal principal) {
        service.markRead(id, principal.getName()); return ResponseEntity.noContent().build();
    }
    @PatchMapping("/read-all") public ResponseEntity<Void> markAllRead(Principal principal) {
        service.markAllRead(principal.getName()); return ResponseEntity.noContent().build();
    }
}
