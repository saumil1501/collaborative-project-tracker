package com.example.collaborative_project_tracker.controller;

import com.example.collaborative_project_tracker.dto.*;
import com.example.collaborative_project_tracker.service.ProjectService;

import jakarta.validation.Valid;
import java.security.Principal;
import java.util.List;

import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/projects")
public class ProjectController {

    private final ProjectService service;

    public ProjectController(ProjectService service) {
        this.service = service;
    }

    @PostMapping
    public ResponseEntity<ProjectResponse> create(
            @Valid @RequestBody CreateProjectRequest request,
            Principal principal) {

        return ResponseEntity.status(HttpStatus.CREATED)
                .body(service.create(request, principal.getName()));
    }

    @GetMapping
    public List<ProjectResponse> getMyProjects(Principal principal) {
        return service.getMyProjects(principal.getName());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(
            @PathVariable Long id,
            Principal principal) {

        service.delete(id, principal.getName());
        return ResponseEntity.noContent().build();
    }
}