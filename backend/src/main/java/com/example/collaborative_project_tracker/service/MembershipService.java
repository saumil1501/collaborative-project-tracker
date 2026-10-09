package com.example.collaborative_project_tracker.service;

import com.example.collaborative_project_tracker.dto.*;
import com.example.collaborative_project_tracker.model.*;
import com.example.collaborative_project_tracker.repository.*;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Service
public class MembershipService {

    private final ProjectMembershipRepository memberships;
    private final ProjectRepository projects;
    private final UserRepository users;

    public MembershipService(
            ProjectMembershipRepository memberships,
            ProjectRepository projects,
            UserRepository users) {
        this.memberships = memberships;
        this.projects = projects;
        this.users = users;
    }

    private AppUser currentUser(String email) {
        return users.findByEmailIgnoreCase(email)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED));
    }

    @Transactional(readOnly = true)
    public void requireMember(Long projectId, String email) {
        AppUser user = currentUser(email);

        if (!memberships.existsByProjectIdAndUserId(
                projectId, user.getId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
    }

    @Transactional(readOnly = true)
    public void requireOwner(Long projectId, String email) {
        AppUser user = currentUser(email);

        ProjectMembership membership = memberships
                .findByProjectIdAndUserId(projectId, user.getId())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND));

        if (membership.getRole() != ProjectRole.OWNER) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
    }

    @Transactional
    public MemberResponse addMember(
            Long projectId, AddMemberRequest request, String email) {

        Project project = projects.findLockedById(projectId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND));
        requireOwner(projectId, email);

        AppUser newMember = users.findByEmailIgnoreCase(
                request.email().trim())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "User not found"));

        if (memberships.existsByProjectIdAndUserId(
                projectId, newMember.getId())) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "Already a member");
        }

        ProjectMembership membership = new ProjectMembership();
        membership.setProject(project);
        membership.setUser(newMember);
        membership.setRole(ProjectRole.MEMBER);

        memberships.save(membership);

        return toResponse(membership);
    }

    @Transactional(readOnly = true)
    public List<MemberResponse> getMembers(
            Long projectId, String email) {

        requireMember(projectId, email);

        return memberships.findByProjectId(projectId)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    private MemberResponse toResponse(ProjectMembership membership) {
        AppUser user = membership.getUser();

        return new MemberResponse(
                user.getId(),
                user.getName(),
                user.getEmail(),
                membership.getRole().name()
        );
    }
}
