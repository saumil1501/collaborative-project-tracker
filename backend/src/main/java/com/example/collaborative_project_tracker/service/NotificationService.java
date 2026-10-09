package com.example.collaborative_project_tracker.service;

import com.example.collaborative_project_tracker.dto.*;
import com.example.collaborative_project_tracker.model.*;
import com.example.collaborative_project_tracker.repository.*;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.time.Instant;
import java.util.Objects;

@Service
public class NotificationService {
    private final NotificationRepository notifications;
    private final UserRepository users;
    private final ProjectMembershipRepository memberships;
    private final ProjectRepository projects;
    private final IssueRepository issues;

    public NotificationService(NotificationRepository notifications, UserRepository users,
            ProjectMembershipRepository memberships, ProjectRepository projects, IssueRepository issues) {
        this.notifications = notifications; this.users = users; this.memberships = memberships;
        this.projects = projects; this.issues = issues;
    }

    @Transactional(readOnly = true)
    public NotificationInbox inbox(String email) {
        Long userId = user(email).getId();
        var items = notifications.findByRecipientIdOrderByCreatedAtDescIdDesc(userId, PageRequest.of(0, 50))
                .stream().map(n -> response(n, userId)).toList();
        return new NotificationInbox(items, notifications.countByRecipientIdAndReadAtIsNull(userId));
    }

    @Transactional
    public void markRead(Long id, String email) {
        Notification notification = notifications.findByIdAndRecipientId(id, user(email).getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (notification.getReadAt() == null) notification.setReadAt(Instant.now());
    }

    @Transactional
    public void markAllRead(String email) { notifications.markAllRead(user(email).getId(), Instant.now()); }

    @Transactional
    public void assigned(Issue issue, String email) {
        AppUser actor = user(email);
        send(issue.getAssignee(), actor, issue.getProject(), issue.getId(), NotificationType.ASSIGNED,
                actor.getName() + " assigned you “" + issue.getTitle() + "”.", true);
    }

    @Transactional
    public void statusChanged(Issue issue, AppUser actor, IssueStatus status) {
        send(issue.getProject().getOwner(), actor, issue.getProject(), issue.getId(), NotificationType.STATUS_CHANGED,
                actor.getName() + " moved “" + issue.getTitle() + "” to " + status.name().replace('_', ' ').toLowerCase() + ".", true);
    }

    @Transactional
    public void commented(Issue issue, AppUser actor) {
        String message = actor.getName() + " commented on “" + issue.getTitle() + "”.";
        AppUser owner = issue.getProject().getOwner();
        send(owner, actor, issue.getProject(), issue.getId(), NotificationType.COMMENT_ADDED, message, true);
        if (issue.getAssignee() != null && !Objects.equals(owner.getId(), issue.getAssignee().getId())) {
            send(issue.getAssignee(), actor, issue.getProject(), issue.getId(), NotificationType.COMMENT_ADDED, message, true);
        }
    }

    @Transactional
    public void leaveRequested(Project project, AppUser actor) {
        send(project.getOwner(), actor, project, null, NotificationType.LEAVE_REQUESTED,
                actor.getName() + " requested permission to leave “" + project.getName() + "”.", true);
    }

    @Transactional
    public void leaveDecided(Project project, AppUser recipient, boolean approved, String email) {
        send(recipient, user(email), project, null, approved ? NotificationType.LEAVE_APPROVED : NotificationType.LEAVE_REJECTED,
                "Your request to leave “" + project.getName() + "” was " + (approved ? "approved." : "rejected."), false);
    }

    private void send(AppUser recipient, AppUser actor, Project project, Long issueId,
            NotificationType type, String message, boolean requireMembership) {
        if (recipient == null || Objects.equals(recipient.getId(), actor.getId())) return;
        if (requireMembership && !memberships.existsByProjectIdAndUserId(project.getId(), recipient.getId())) return;
        Notification n = new Notification(); n.setRecipient(recipient); n.setProjectId(project.getId());
        n.setIssueId(issueId); n.setType(type); n.setMessage(message);
        notifications.save(n);
    }

    private AppUser user(String email) {
        return users.findByEmailIgnoreCase(email).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
    }

    private NotificationResponse response(Notification n, Long userId) {
        boolean projectAvailable = memberships.existsByProjectIdAndUserId(n.getProjectId(), userId)
                && projects.existsById(n.getProjectId());
        boolean issueAvailable = projectAvailable && n.getIssueId() != null && issues.findById(n.getIssueId())
                .filter(issue -> Objects.equals(issue.getProject().getId(), n.getProjectId())).isPresent();
        // Missing issue targets must not fall back to opening unrelated project settings.
        Long projectId = projectAvailable && (n.getIssueId() == null || issueAvailable) ? n.getProjectId() : null;
        return new NotificationResponse(n.getId(), n.getType(), n.getMessage(), projectId,
                issueAvailable ? n.getIssueId() : null, n.getCreatedAt(), n.getReadAt());
    }
}
