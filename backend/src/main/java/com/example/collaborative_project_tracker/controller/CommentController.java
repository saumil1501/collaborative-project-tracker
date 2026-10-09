package com.example.collaborative_project_tracker.controller;

import com.example.collaborative_project_tracker.dto.*;
import com.example.collaborative_project_tracker.service.CommentService;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import java.security.Principal;
import java.util.List;

@RestController
@RequestMapping("/api/projects/{projectId}/issues/{issueId}/comments")
public class CommentController {
    private final CommentService service;

    public CommentController(CommentService service) { this.service = service; }

    @GetMapping
    public List<CommentResponse> list(@PathVariable Long projectId, @PathVariable Long issueId,
                                      Principal principal) {
        return service.list(projectId, issueId, principal.getName());
    }

    @PostMapping
    public ResponseEntity<CommentResponse> create(@PathVariable Long projectId, @PathVariable Long issueId,
                                                  @Valid @RequestBody CommentRequest request, Principal principal) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(service.create(projectId, issueId, request, principal.getName()));
    }

    @PutMapping("/{commentId}")
    public CommentResponse update(@PathVariable Long projectId, @PathVariable Long issueId,
                                  @PathVariable Long commentId, @Valid @RequestBody CommentRequest request,
                                  Principal principal) {
        return service.update(projectId, issueId, commentId, request, principal.getName());
    }

    @DeleteMapping("/{commentId}")
    public ResponseEntity<Void> delete(@PathVariable Long projectId, @PathVariable Long issueId,
                                      @PathVariable Long commentId, Principal principal) {
        service.delete(projectId, issueId, commentId, principal.getName());
        return ResponseEntity.noContent().build();
    }
}
