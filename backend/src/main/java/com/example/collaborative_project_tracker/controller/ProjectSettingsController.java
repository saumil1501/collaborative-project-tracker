package com.example.collaborative_project_tracker.controller;

import com.example.collaborative_project_tracker.dto.*;
import com.example.collaborative_project_tracker.service.ProjectSettingsService;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import java.security.Principal;
import java.util.List;

@RestController
@RequestMapping("/api/projects/{projectId}")
public class ProjectSettingsController {
    private final ProjectSettingsService service;
    public ProjectSettingsController(ProjectSettingsService service) { this.service = service; }

    @GetMapping
    public ProjectResponse get(@PathVariable Long projectId, Principal principal) {
        return service.getProject(projectId, principal.getName());
    }
    @PutMapping
    public ProjectResponse update(@PathVariable Long projectId, @Valid @RequestBody CreateProjectRequest request, Principal principal) {
        return service.updateProject(projectId, request, principal.getName());
    }
    @DeleteMapping("/members/{userId}")
    public ResponseEntity<Void> removeMember(@PathVariable Long projectId, @PathVariable Long userId, Principal principal) {
        service.removeMember(projectId, userId, principal.getName()); return ResponseEntity.noContent().build();
    }
    @GetMapping("/leave-requests")
    public List<LeaveRequestResponse> list(@PathVariable Long projectId, Principal principal) {
        return service.listRequests(projectId, principal.getName());
    }
    @PostMapping("/leave-requests")
    public ResponseEntity<LeaveRequestResponse> request(@PathVariable Long projectId, Principal principal) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.requestLeave(projectId, principal.getName()));
    }
    @PatchMapping("/leave-requests/{requestId}/cancel")
    public LeaveRequestResponse cancel(@PathVariable Long projectId, @PathVariable Long requestId, Principal principal) {
        return service.cancelLeave(projectId, requestId, principal.getName());
    }
    @PatchMapping("/leave-requests/{requestId}/approve")
    public LeaveRequestResponse approve(@PathVariable Long projectId, @PathVariable Long requestId, Principal principal) {
        return service.decideLeave(projectId, requestId, true, principal.getName());
    }
    @PatchMapping("/leave-requests/{requestId}/reject")
    public LeaveRequestResponse reject(@PathVariable Long projectId, @PathVariable Long requestId, Principal principal) {
        return service.decideLeave(projectId, requestId, false, principal.getName());
    }
}
