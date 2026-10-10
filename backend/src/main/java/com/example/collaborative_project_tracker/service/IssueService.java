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
    private final NotificationService notifications;

    public IssueService(
            IssueRepository issues,
            ProjectRepository projects,
            ProjectMembershipRepository memberships,
            UserRepository users,
            MembershipService membershipService,
            IssueCommentRepository comments,
            IssueActivityRepository activities,
            ActivityService activityService, NotificationService notifications) {
        this.issues = issues;
        this.projects = projects;
        this.memberships = memberships;
        this.users = users;
        this.membershipService = membershipService;
        this.comments = comments;
        this.activities = activities;
        this.activityService = activityService;
        this.notifications = notifications;
    }

    @Transactional
    public IssueResponse create(
            Long projectId, IssueRequest request, String email) {

        Project project = requireIssueOwner(projectId, email);

        Issue issue = new Issue();
        issue.setProject(project);
        Long next = project.getNextIssueNumber();
        if (next == null) next = issues.highestIssueNumber(projectId) + 1;
        issue.setIssueNumber(next);
        issue.setPlanningRank(issues.highestPlanningRank(projectId) + 1);
        project.setNextIssueNumber(next + 1);
        applyHierarchy(issue, request, email, false);
        applyMetadata(issue, request, email, false);
        issue.setTitle(request.title().trim());
        issue.setDescription(request.description());
        issue.setPriority(request.priority() != null
                ? request.priority() : IssuePriority.MEDIUM);
        issue.setStatus(IssueStatus.TODO);
        issue.setDueDate(request.dueDate());
        issue.setAssignee(resolveAssignee(projectId, request.assigneeId()));

        Issue saved = issues.save(issue);
        activityService.record(saved, email, ActivityField.CREATED, null, saved.getTitle());
        notifications.assigned(saved, email);
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

        Project project = projects.findLockedById(projectId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        membershipService.requireMember(projectId, email);
        Issue issue = getIssue(projectId, issueId);
        AppUser actor = users.findByEmailIgnoreCase(email)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        boolean owner = Objects.equals(project.getOwner().getId(), actor.getId());
        boolean assignee = issue.getAssignee() != null
                && Objects.equals(issue.getAssignee().getId(), actor.getId());
        if (!owner && !assignee) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Only the project owner or current assignee can change issue status");
        }
        validateStatus(issue, request.status());
        if (issue.getStatus() != request.status()) notifications.statusChanged(issue, actor, request.status());
        activityService.record(issue, email, ActivityField.STATUS, issue.getStatus().name(), request.status().name());
        issue.setStatus(request.status());

        return toResponse(issue);
    }

    @Transactional
    public IssueResponse update(
            Long projectId, Long issueId,
            IssueRequest request, String email) {

        requireIssueOwner(projectId, email);

        Issue issue = getIssue(projectId, issueId);

        applyHierarchy(issue, request, email, true);
        boolean assignmentChanged = !Objects.equals(issue.getAssignee() != null ? issue.getAssignee().getId() : null, request.assigneeId());
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
        applyMetadata(issue, request, email, true);
        issue.setTitle(request.title().trim());
        issue.setDescription(request.description());
        issue.setPriority(priority);
        issue.setDueDate(request.dueDate());
        issue.setAssignee(assignee);
        if (assignmentChanged && assignee != null) notifications.assigned(issue, email);

        return toResponse(issue);
    }

    @Transactional
    public void delete(Long projectId, Long issueId, String email) {
        requireIssueOwner(projectId, email);
        Issue issue = getIssue(projectId, issueId);
        if (!issues.findByParentId(issueId).isEmpty())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Move or delete child issues before deleting their parent");
        comments.deleteAllByIssueId(issueId);
        activities.deleteAllByIssueId(issueId);
        issues.delete(issue);
    }

    private Project requireIssueOwner(Long projectId, String email) {
        Project project = projects.findLockedById(projectId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        membershipService.requireMember(projectId, email);
        AppUser actor = users.findByEmailIgnoreCase(email)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        if (!Objects.equals(project.getOwner().getId(), actor.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Only the project owner can create, change or delete issues");
        }
        return project;
    }

    private void applyMetadata(Issue issue, IssueRequest request, String email, boolean record) {
        if (request.storyPoints() != null && !List.of(1, 2, 3, 5, 8, 13).contains(request.storyPoints()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Story points must be 1, 2, 3, 5, 8 or 13");
        var labels = request.labels() != null ? request.labels() : List.<String>of();
        if (labels.size() > 10 || labels.stream().anyMatch(label -> label == null || !label.matches("[a-zA-Z0-9][a-zA-Z0-9_-]{0,29}")))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Use up to 10 labels, each 1-30 letters, digits, hyphens or underscores");
        String normalized = labels.stream().map(label -> label.toLowerCase(java.util.Locale.ROOT)).distinct().sorted().collect(java.util.stream.Collectors.joining(","));
        String storedLabels = normalized.isEmpty() ? null : normalized;
        IssueType type = request.type() != null ? request.type() : IssueType.TASK;
        if (record) {
            activityService.record(issue, email, ActivityField.TYPE, issue.getType().name(), type.name());
            activityService.record(issue, email, ActivityField.STORY_POINTS, Objects.toString(issue.getStoryPoints(), null), Objects.toString(request.storyPoints(), null));
            activityService.record(issue, email, ActivityField.LABELS, issue.getLabels(), storedLabels);
        }
        issue.setType(type); issue.setStoryPoints(request.storyPoints()); issue.setLabels(storedLabels);
    }

    private void applyHierarchy(Issue issue, IssueRequest request, String email, boolean record) {
        IssueType type = request.type() != null ? request.type() : IssueType.TASK;
        boolean special = type == IssueType.EPIC || type == IssueType.SUBTASK;
        boolean wasSpecial = issue.getType() == IssueType.EPIC || issue.getType() == IssueType.SUBTASK;
        if (record && type != issue.getType() && (special || wasSpecial))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Epic and subtask types cannot be converted; create a new issue instead");
        if (special && request.storyPoints() != null)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Estimate stories, tasks and bugs; epics and subtasks have no story points");
        if (type == IssueType.EPIC && request.parentId() != null)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Epics cannot have a parent");
        if (type == IssueType.SUBTASK && request.parentId() == null)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A subtask requires a story, task or bug parent");
        Issue parent = request.parentId() != null ? getIssue(issue.getProject().getId(), request.parentId()) : null;
        if (parent != null) {
            if (Objects.equals(parent.getId(), issue.getId()))
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "An issue cannot be its own parent");
            if (type == IssueType.SUBTASK ? !parent.isPlannable() : parent.getType() != IssueType.EPIC)
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Use Epic > Story/Task/Bug > Subtask hierarchy");
            for (Issue ancestor = parent; ancestor != null; ancestor = ancestor.getParent()) {
                if (Objects.equals(ancestor.getId(), issue.getId()))
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Parent links cannot form a cycle");
                if (ancestor.getStatus() == IssueStatus.DONE && issue.getStatus() != IssueStatus.DONE)
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "Reopen the completed parent before adding unfinished work");
            }
        }
        if (record) activityService.record(issue, email, ActivityField.PARENT,
                issue.getParent() != null ? issue.getParent().getIssueKey() : null, parent != null ? parent.getIssueKey() : null);
        issue.setParent(parent);
    }

    private void validateStatus(Issue issue, IssueStatus status) {
        if (status == IssueStatus.DONE && issues.existsByParentIdAndStatusNot(issue.getId(), IssueStatus.DONE))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Complete all child issues before marking their parent done");
        if (status != IssueStatus.DONE) {
            for (Issue ancestor = issue.getParent(); ancestor != null; ancestor = ancestor.getParent())
                if (ancestor.getStatus() == IssueStatus.DONE)
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "Reopen the completed parent before reopening this issue");
        }
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
                issue.getCreatedAt(), issue.getIssueKey(), issue.getType(), issue.getStoryPoints(),
                issue.getLabels() != null ? List.of(issue.getLabels().split(",")) : List.of(),
                issue.getEffectiveSprint() != null ? issue.getEffectiveSprint().getId() : null,
                issue.getPlanningRank() != null ? issue.getPlanningRank() : issue.getId(),
                issue.getParent() != null ? issue.getParent().getId() : null,
                issue.getParent() != null ? issue.getParent().getIssueKey() : null
        );
    }
}
