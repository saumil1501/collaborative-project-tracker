package com.example.collaborative_project_tracker.controller;

import com.example.collaborative_project_tracker.dto.*;
import com.example.collaborative_project_tracker.service.IssueService;

import jakarta.validation.Valid;
import java.security.Principal;
import java.util.List;

import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/projects/{projectId}/issues")
public class IssueController {

    private final IssueService service;

    public IssueController(IssueService service) {
        this.service = service;
    }

    @PostMapping
    public ResponseEntity<IssueResponse> create(
            @PathVariable Long projectId,
            @Valid @RequestBody IssueRequest request,
            Principal principal) {

        return ResponseEntity.status(HttpStatus.CREATED)
                .body(service.create(
                        projectId, request, principal.getName()));
    }

    @GetMapping
    public List<IssueResponse> list(
            @PathVariable Long projectId,
            Principal principal) {
        return service.list(projectId, principal.getName());
    }

    @PutMapping("/{issueId}")
    public IssueResponse update(
            @PathVariable Long projectId,
            @PathVariable Long issueId,
            @Valid @RequestBody IssueRequest request,
            Principal principal) {
        return service.update(
                projectId, issueId, request, principal.getName());
    }

    @PatchMapping("/{issueId}/status")
    public IssueResponse updateStatus(
            @PathVariable Long projectId,
            @PathVariable Long issueId,
            @Valid @RequestBody UpdateIssueStatusRequest request,
            Principal principal) {
        return service.updateStatus(
                projectId, issueId, request, principal.getName());
    }

    @DeleteMapping("/{issueId}")
    public ResponseEntity<Void> delete(
            @PathVariable Long projectId,
            @PathVariable Long issueId,
            Principal principal) {

        service.delete(projectId, issueId, principal.getName());
        return ResponseEntity.noContent().build();
    }
}