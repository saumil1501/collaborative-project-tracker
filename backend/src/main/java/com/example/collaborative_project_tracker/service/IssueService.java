package com.example.collaborative_project_tracker.service;

import com.example.collaborative_project_tracker.dto.*;
import com.example.collaborative_project_tracker.model.*;
import com.example.collaborative_project_tracker.repository.*;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Objects;

@Service
public class IssueService {

    private final IssueRepository issues;
    private final ProjectRepository projects;
    private final ProjectMembershipRepository memberships;
    private final UserRepository users;
    private final MembershipService membershipService;
    private final IssueCommentRepository comments;
    private final IssueActivityRepository activities;
    private final ActivityService activityService;

    public IssueService(
            IssueRepository issues,
            ProjectRepository projects,
            ProjectMembershipRepository memberships,
            UserRepository users,
            MembershipService membershipService,
            IssueCommentRepository comments,
            IssueActivityRepository activities,
            ActivityService activityService) {
        this.issues = issues;
        this.projects = projects;
        this.memberships = memberships;
        this.users = users;
        this.membershipService = membershipService;
        this.comments = comments;
        this.activities = activities;
        this.activityService = activityService;
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

        Issue saved = issues.save(issue);
        activityService.record(saved, email, ActivityField.CREATED, null, saved.getTitle());
        return toResponse(saved);
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
        activityService.record(issue, email, ActivityField.STATUS, issue.getStatus().name(), request.status().name());
        issue.setStatus(request.status());

        return toResponse(issue);
    }

    @Transactional
    public IssueResponse update(
            Long projectId, Long issueId,
            IssueRequest request, String email) {

        membershipService.requireMember(projectId, email);

        Issue issue = getIssue(projectId, issueId);

        AppUser assignee = resolveAssignee(projectId, request.assigneeId());
        IssuePriority priority = request.priority() != null ? request.priority() : IssuePriority.MEDIUM;
        activityService.record(issue, email, ActivityField.TITLE, issue.getTitle(), request.title().trim());
        activityService.record(issue, email, ActivityField.DESCRIPTION, issue.getDescription(), request.description());
        activityService.record(issue, email, ActivityField.PRIORITY, issue.getPriority().name(), priority.name());
        activityService.record(issue, email, ActivityField.DUE_DATE,
                issue.getDueDate() != null ? issue.getDueDate().toString() : null,
                request.dueDate() != null ? request.dueDate().toString() : null);
        if (!Objects.equals(issue.getAssignee() != null ? issue.getAssignee().getId() : null, request.assigneeId())) {
            activityService.record(issue, email, ActivityField.ASSIGNEE, assigneeLabel(issue.getAssignee()), assigneeLabel(assignee));
        }
        issue.setTitle(request.title().trim());
        issue.setDescription(request.description());
        issue.setPriority(priority);
        issue.setDueDate(request.dueDate());
        issue.setAssignee(assignee);

        return toResponse(issue);
    }

    @Transactional
    public void delete(Long projectId, Long issueId, String email) {
        membershipService.requireMember(projectId, email);
        Issue issue = getIssue(projectId, issueId);
        comments.deleteAllByIssueId(issueId);
        activities.deleteAllByIssueId(issueId);
        issues.delete(issue);
    }

    private String assigneeLabel(AppUser user) {
        return user != null ? user.getName() + " (#" + user.getId() + ")" : null;
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
