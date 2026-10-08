package com.example.collaborative_project_tracker.controller;

import com.example.collaborative_project_tracker.dto.*;
import com.example.collaborative_project_tracker.service.MembershipService;

import jakarta.validation.Valid;
import java.security.Principal;
import java.util.List;

import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/projects/{projectId}/members")
public class MembershipController {

    private final MembershipService service;

    public MembershipController(MembershipService service) {
        this.service = service;
    }

    @PostMapping
    public ResponseEntity<MemberResponse> addMember(
            @PathVariable Long projectId,
            @Valid @RequestBody AddMemberRequest request,
            Principal principal) {

        return ResponseEntity.status(HttpStatus.CREATED)
                .body(service.addMember(
                        projectId, request, principal.getName()));
    }

    @GetMapping
    public List<MemberResponse> getMembers(
            @PathVariable Long projectId,
            Principal principal) {

        return service.getMembers(projectId, principal.getName());
    }
}