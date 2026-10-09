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
public class ProjectService {

    private final ProjectRepository projects;
    private final UserRepository users;
    private final ProjectMembershipRepository memberships;
    private final IssueRepository issueRepository;
    private final IssueCommentRepository comments;
    private final IssueActivityRepository activities;
    private final ProjectLeaveRequestRepository leaveRequests;

    public ProjectService(ProjectRepository projects, UserRepository users, ProjectMembershipRepository memberships, IssueRepository issueRepository, IssueCommentRepository comments, IssueActivityRepository activities, ProjectLeaveRequestRepository leaveRequests) {
        this.projects = projects;
        this.users = users;
		this.memberships = memberships;
		this.issueRepository = issueRepository;
        this.comments = comments;
        this.activities = activities;
        this.leaveRequests = leaveRequests;
    }

    @Transactional
    public ProjectResponse create(
            CreateProjectRequest request, String email) {

        AppUser owner = users.findByEmailIgnoreCase(email)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED));

        Project project = new Project();
        project.setName(request.name().trim());
        project.setDescription(request.description());
        project.setOwner(owner);
        if (request.projectKey() != null) {
            if (!request.projectKey().matches("[A-Z]{2,10}")) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid project key");
            if (projects.existsByProjectKey(request.projectKey())) throw new ResponseStatusException(HttpStatus.CONFLICT, "Project key is already in use");
            project.setProjectKey(request.projectKey());
        }
        project.setNextIssueNumber(1L);

        Project saved;
        try { saved = projects.saveAndFlush(project); }
        catch (org.springframework.dao.DataIntegrityViolationException exception) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Project key is already in use", exception);
        }

        ProjectMembership membership = new ProjectMembership();
        membership.setProject(saved);
        membership.setUser(owner);
        membership.setRole(ProjectRole.OWNER);

        memberships.save(membership);

        return toResponse(saved);
    }

    @Transactional(readOnly = true)
    public List<ProjectResponse> getMyProjects(String email) {

        AppUser user = users.findByEmailIgnoreCase(email)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED));

        return memberships.findByUserId(user.getId())
                .stream()
                .map(m -> toResponse(m.getProject()))
                .toList();
    }

    @Transactional
    public void delete(Long projectId, String email) {

        Project project = projects.findLockedById(projectId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND));

        if (!project.getOwner().getEmail().equalsIgnoreCase(email)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }

        // Delete all issues associated with this project
        comments.deleteAllByProjectId(projectId);
        activities.deleteAllByProjectId(projectId);
        issueRepository.deleteByProjectId(projectId);

        // Delete project memberships
        leaveRequests.deleteAllByProjectId(projectId);
        memberships.deleteByProjectId(projectId);

        // Finally, delete the project
        projects.delete(project);
    }

    private ProjectResponse toResponse(Project project) {
        return new ProjectResponse(
                project.getId(),
                project.getName(),
                project.getDescription(),
                project.getOwner().getId(),
                project.getCreatedAt(), project.getDisplayKey()
        );
    }
}
