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
public class IssueService {

    private final IssueRepository issues;
    private final ProjectRepository projects;
    private final ProjectMembershipRepository memberships;
    private final UserRepository users;
    private final MembershipService membershipService;

    public IssueService(
            IssueRepository issues,
            ProjectRepository projects,
            ProjectMembershipRepository memberships,
            UserRepository users,
            MembershipService membershipService) {
        this.issues = issues;
        this.projects = projects;
        this.memberships = memberships;
        this.users = users;
        this.membershipService = membershipService;
    }

    @Transactional
    public IssueResponse create(
            Long projectId, IssueRequest request, String email) {

        membershipService.requireMember(projectId, email);

        Project project = projects.findById(projectId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND));

        Issue issue = new Issue();
        issue.setProject(project);
        issue.setTitle(request.title().trim());
        issue.setDescription(request.description());
        issue.setPriority(request.priority() != null
                ? request.priority() : IssuePriority.MEDIUM);
        issue.setStatus(IssueStatus.TODO);
        issue.setDueDate(request.dueDate());
        issue.setAssignee(resolveAssignee(projectId, request.assigneeId()));

        return toResponse(issues.save(issue));
    }

    @Transactional(readOnly = true)
    public List<IssueResponse> list(Long projectId, String email) {
        membershipService.requireMember(projectId, email);

        return issues.findByProjectIdOrderByCreatedAtDesc(projectId)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public IssueResponse updateStatus(
            Long projectId, Long issueId,
            UpdateIssueStatusRequest request, String email) {

        membershipService.requireMember(projectId, email);

        Issue issue = getIssue(projectId, issueId);
        issue.setStatus(request.status());

        return toResponse(issue);
    }

    @Transactional
    public IssueResponse update(
            Long projectId, Long issueId,
            IssueRequest request, String email) {

        membershipService.requireMember(projectId, email);

        Issue issue = getIssue(projectId, issueId);

        issue.setTitle(request.title().trim());
        issue.setDescription(request.description());
        issue.setPriority(request.priority() != null
                ? request.priority() : IssuePriority.MEDIUM);
        issue.setDueDate(request.dueDate());
        issue.setAssignee(resolveAssignee(projectId, request.assigneeId()));

        return toResponse(issue);
    }

    @Transactional
    public void delete(Long projectId, Long issueId, String email) {
        membershipService.requireMember(projectId, email);
        issues.delete(getIssue(projectId, issueId));
    }

    private Issue getIssue(Long projectId, Long issueId) {
        Issue issue = issues.findById(issueId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND));

        if (!issue.getProject().getId().equals(projectId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }

        return issue;
    }

    private AppUser resolveAssignee(Long projectId, Long assigneeId) {
        if (assigneeId == null) return null;

        if (!memberships.existsByProjectIdAndUserId(
                projectId, assigneeId)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Assignee must be a project member");
        }

        return users.findById(assigneeId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND));
    }

    private IssueResponse toResponse(Issue issue) {
        AppUser assignee = issue.getAssignee();

        return new IssueResponse(
                issue.getId(),
                issue.getTitle(),
                issue.getDescription(),
                issue.getStatus(),
                issue.getPriority(),
                assignee != null ? assignee.getId() : null,
                assignee != null ? assignee.getName() : null,
                issue.getDueDate(),
                issue.getCreatedAt()
        );
    }
}