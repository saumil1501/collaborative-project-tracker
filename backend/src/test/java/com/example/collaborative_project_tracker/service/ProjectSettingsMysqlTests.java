package com.example.collaborative_project_tracker.service;

import com.example.collaborative_project_tracker.dto.*;
import com.example.collaborative_project_tracker.model.*;
import com.example.collaborative_project_tracker.repository.*;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@Transactional
@EnabledIfSystemProperty(named = "liveMysqlTests", matches = "true")
class ProjectSettingsMysqlTests {
    @Autowired UserRepository users;
    @Autowired ProjectRepository projects;
    @Autowired ProjectMembershipRepository memberships;
    @Autowired ProjectLeaveRequestRepository requests;
    @Autowired IssueRepository issues;
    @Autowired IssueCommentRepository comments;
    @Autowired IssueActivityRepository activities;
    @Autowired ProjectService projectService;
    @Autowired MembershipService membershipService;
    @Autowired ProjectSettingsService settings;
    @Autowired IssueService issueService;
    @Autowired CommentService commentService;
    @Autowired EntityManager entityManager;
    @Autowired NotificationService notifications;

    private AppUser user(String name) {
        AppUser user = new AppUser(); user.setName(name);
        user.setEmail("settings-check-" + UUID.randomUUID() + "@example.invalid");
        user.setPassword("unused-test-hash"); return users.save(user);
    }

    @Test
    void legacyIssuesKeepKeysAndNewNumbersStartAboveExistingIds() {
        AppUser owner = user("Legacy owner");
        Project project = new Project(); project.setName("Legacy verification"); project.setOwner(owner);
        projects.saveAndFlush(project);
        ProjectMembership membership = new ProjectMembership(); membership.setProject(project); membership.setUser(owner); membership.setRole(ProjectRole.OWNER);
        memberships.save(membership);
        Issue legacy = new Issue(); legacy.setProject(project); legacy.setTitle("Legacy issue"); legacy.setType(null);
        issues.saveAndFlush(legacy);
        Long projectId = project.getId(), legacyId = legacy.getId();
        entityManager.clear();
        var original = issueService.list(projectId, owner.getEmail()).getFirst();
        assertEquals("PRJ" + projectId + "-" + legacyId, original.issueKey());
        assertEquals(IssueType.TASK, original.type()); assertTrue(original.labels().isEmpty()); assertNull(original.storyPoints());
        var added = issueService.create(projectId, new IssueRequest("New issue", null, null, null, null), owner.getEmail());
        assertEquals("PRJ" + projectId + "-" + (legacyId + 1), added.issueKey());
        entityManager.flush(); entityManager.clear();
        assertEquals(legacyId + 2, projects.findById(projectId).orElseThrow().getNextIssueNumber());
        assertEquals(original.issueKey(), issueService.list(projectId, owner.getEmail()).stream().filter(issue -> issue.id().equals(legacyId)).findFirst().orElseThrow().issueKey());
    }

    @Test
    void structuredIssuesPersistWithStableKeysAndOwnerOnlyMetadata() {
        AppUser owner = user("Structured owner"), member = user("Structured member");
        String key = "T" + UUID.randomUUID().toString().replace("-", "").substring(0, 6).chars().mapToObj(value -> String.valueOf((char) ('A' + Character.digit(value, 16)))).collect(java.util.stream.Collectors.joining());
        var project = projectService.create(new CreateProjectRequest("Structured verification", null, key), owner.getEmail());
        membershipService.addMember(project.id(), new AddMemberRequest(member.getEmail()), owner.getEmail());
        var first = issueService.create(project.id(), new IssueRequest("First", null, null, member.getId(), null,
                IssueType.BUG, 8, java.util.List.of("Frontend", "auth")), owner.getEmail());
        assertEquals(key + "-1", first.issueKey());
        entityManager.flush(); entityManager.clear();
        var loaded = issueService.list(project.id(), member.getEmail()).getFirst();
        assertEquals(IssueType.BUG, loaded.type()); assertEquals(8, loaded.storyPoints());
        assertEquals(java.util.List.of("auth", "frontend"), loaded.labels());
        assertEquals(HttpStatus.FORBIDDEN, assertThrows(ResponseStatusException.class,
            () -> issueService.update(project.id(), first.id(), new IssueRequest("Forbidden", null, null, member.getId(), null,
                IssueType.STORY, 13, java.util.List.of("changed")), member.getEmail())).getStatusCode());
        issueService.updateStatus(project.id(), first.id(), new UpdateIssueStatusRequest(IssueStatus.DONE), member.getEmail());
        settings.updateProject(project.id(), new CreateProjectRequest("Renamed project", null), owner.getEmail());
        assertEquals(first.issueKey(), issueService.list(project.id(), owner.getEmail()).getFirst().issueKey());
        issueService.delete(project.id(), first.id(), owner.getEmail());
        assertEquals(key + "-2", issueService.create(project.id(), new IssueRequest("Next", null, null, null, null), owner.getEmail()).issueKey());
        entityManager.flush(); entityManager.clear();
        assertEquals(3L, projects.findById(project.id()).orElseThrow().getNextIssueNumber());
    }

    @Test
    void liveNotificationsPersistForTheRightPeopleAndRespectReadOwnershipAndAccess() {
        AppUser owner = user("Notification owner"), member = user("Notification assignee"), other = user("Notification commenter");
        Long projectId = projectService.create(new CreateProjectRequest("Notification verification", null), owner.getEmail()).id();
        membershipService.addMember(projectId, new AddMemberRequest(member.getEmail()), owner.getEmail());
        membershipService.addMember(projectId, new AddMemberRequest(other.getEmail()), owner.getEmail());
        Long issueId = issueService.create(projectId, new IssueRequest("Notification task", null, null, member.getId(), null), owner.getEmail()).id();
        issueService.update(projectId, issueId, new IssueRequest("Notification task", null, null, member.getId(), null), owner.getEmail());
        assertEquals(1, notifications.inbox(member.getEmail()).unreadCount());
        issueService.updateStatus(projectId, issueId, new UpdateIssueStatusRequest(IssueStatus.IN_PROGRESS), member.getEmail());
        issueService.updateStatus(projectId, issueId, new UpdateIssueStatusRequest(IssueStatus.IN_PROGRESS), member.getEmail());
        assertEquals(1, notifications.inbox(owner.getEmail()).unreadCount());
        commentService.create(projectId, issueId, new CommentRequest("Third member comment"), other.getEmail());
        commentService.create(projectId, issueId, new CommentRequest("Owner comment"), owner.getEmail());
        commentService.create(projectId, issueId, new CommentRequest("Assignee comment"), member.getEmail());
        assertEquals(3, notifications.inbox(member.getEmail()).unreadCount());
        assertEquals(3, notifications.inbox(owner.getEmail()).unreadCount());
        assertEquals(0, notifications.inbox(other.getEmail()).unreadCount());
        var request = settings.requestLeave(projectId, member.getEmail());
        settings.decideLeave(projectId, request.id(), false, owner.getEmail());
        settings.requestLeave(projectId, member.getEmail());
        settings.decideLeave(projectId, request.id(), true, owner.getEmail());
        entityManager.flush(); entityManager.clear();
        var memberInbox = notifications.inbox(member.getEmail());
        assertEquals(5, memberInbox.unreadCount());
        assertTrue(memberInbox.items().stream().allMatch(n -> n.projectId() == null && n.issueId() == null));
        assertEquals(NotificationType.LEAVE_APPROVED, memberInbox.items().getFirst().type());
        Long notificationId = memberInbox.items().getFirst().id();
        assertEquals(HttpStatus.NOT_FOUND, assertThrows(ResponseStatusException.class,
                () -> notifications.markRead(notificationId, owner.getEmail())).getStatusCode());
        notifications.markRead(notificationId, member.getEmail());
        notifications.markRead(notificationId, member.getEmail());
        assertEquals(4, notifications.inbox(member.getEmail()).unreadCount());
        notifications.markAllRead(member.getEmail());
        assertEquals(0, notifications.inbox(member.getEmail()).unreadCount());
        assertEquals(5, notifications.inbox(owner.getEmail()).unreadCount());
        projectService.delete(projectId, owner.getEmail());
        entityManager.flush(); entityManager.clear();
        assertTrue(notifications.inbox(owner.getEmail()).items().stream().allMatch(n -> n.projectId() == null));
    }

    @Test
    void liveStatusAllowsAssigneeWhileOtherChangesRequireOwner() {
        AppUser owner = user("Status test owner");
        AppUser assignee = user("Status test assignee");
        AppUser other = user("Status test other member");
        Long projectId = projectService.create(new CreateProjectRequest("Temporary status verification", null), owner.getEmail()).id();
        membershipService.addMember(projectId, new AddMemberRequest(assignee.getEmail()), owner.getEmail());
        membershipService.addMember(projectId, new AddMemberRequest(other.getEmail()), owner.getEmail());
        Long issueId = issueService.create(projectId, new IssueRequest("Status permissions", null,
                IssuePriority.MEDIUM, assignee.getId(), null), owner.getEmail()).id();
        issueService.updateStatus(projectId, issueId, new UpdateIssueStatusRequest(IssueStatus.IN_PROGRESS), assignee.getEmail());
        issueService.updateStatus(projectId, issueId, new UpdateIssueStatusRequest(IssueStatus.DONE), owner.getEmail());
        issueService.update(projectId, issueId, new IssueRequest("Status permissions", null,
                IssuePriority.MEDIUM, other.getId(), null), owner.getEmail());
        entityManager.flush(); entityManager.clear();
        int activityCount = activities.findByIssueIdOrderByCreatedAtDescIdDesc(issueId).size();
        assertEquals(HttpStatus.FORBIDDEN, assertThrows(ResponseStatusException.class, () ->
                issueService.updateStatus(projectId, issueId, new UpdateIssueStatusRequest(IssueStatus.TODO), assignee.getEmail())).getStatusCode());
        assertEquals(HttpStatus.FORBIDDEN, assertThrows(ResponseStatusException.class, () ->
                issueService.update(projectId, issueId, new IssueRequest("Unauthorized title", "Unauthorized details",
                        IssuePriority.HIGH, assignee.getId(), null), other.getEmail())).getStatusCode());
        assertEquals(HttpStatus.FORBIDDEN, assertThrows(ResponseStatusException.class, () ->
                issueService.delete(projectId, issueId, other.getEmail())).getStatusCode());
        assertEquals(HttpStatus.FORBIDDEN, assertThrows(ResponseStatusException.class, () ->
                issueService.create(projectId, new IssueRequest("Unauthorized creation", null, null, null, null), other.getEmail())).getStatusCode());
        commentService.create(projectId, issueId, new CommentRequest("Members can still discuss"), assignee.getEmail());
        entityManager.flush(); entityManager.clear();
        assertEquals("Status permissions", issues.findById(issueId).orElseThrow().getTitle());
        assertEquals(1, comments.findByIssueIdOrderByCreatedAtAscIdAsc(issueId).size());
        assertEquals(IssueStatus.DONE, issues.findById(issueId).orElseThrow().getStatus());
        assertEquals(activityCount, activities.findByIssueIdOrderByCreatedAtDescIdDesc(issueId).size());
    }

    @Test
    void liveWorkflowPersistsDecisionsAndUnassignmentAndPreservesContributions() {
        AppUser owner = user("Settings test owner"); AppUser member = user("Settings test member");
        Long projectId = projectService.create(new CreateProjectRequest("Temporary settings verification", null), owner.getEmail()).id();
        membershipService.addMember(projectId, new AddMemberRequest(member.getEmail()), owner.getEmail());
        Long issueId = issueService.create(projectId, new IssueRequest("Assigned verification issue", null,
                IssuePriority.MEDIUM, member.getId(), null), owner.getEmail()).id();
        commentService.create(projectId, issueId, new CommentRequest("Contribution to preserve"), member.getEmail());
        settings.updateProject(projectId, new CreateProjectRequest("Updated verification project", "Details"), owner.getEmail());
        var request = settings.requestLeave(projectId, member.getEmail());
        assertTrue(memberships.existsByProjectIdAndUserId(projectId, member.getId()));
        settings.decideLeave(projectId, request.id(), false, owner.getEmail());
        assertTrue(memberships.existsByProjectIdAndUserId(projectId, member.getId()));
        settings.requestLeave(projectId, member.getEmail());
        settings.cancelLeave(projectId, request.id(), member.getEmail());
        settings.requestLeave(projectId, member.getEmail());
        settings.decideLeave(projectId, request.id(), true, owner.getEmail());
        entityManager.flush(); entityManager.clear();
        assertFalse(memberships.existsByProjectIdAndUserId(projectId, member.getId()));
        assertNull(issues.findById(issueId).orElseThrow().getAssignee());
        assertEquals(LeaveRequestStatus.APPROVED, requests.findById(request.id()).orElseThrow().getStatus());
        assertEquals(1, comments.findByIssueIdOrderByCreatedAtAscIdAsc(issueId).size());
        assertTrue(activities.findByIssueIdOrderByCreatedAtDescIdDesc(issueId).stream()
                .anyMatch(event -> event.getField() == ActivityField.ASSIGNEE && event.getNewValue() == null));
        assertThrows(ResponseStatusException.class, () -> settings.getProject(projectId, member.getEmail()));
        // Re-add and remove directly to exercise the second removal path too.
        membershipService.addMember(projectId, new AddMemberRequest(member.getEmail()), owner.getEmail());
        issueService.update(projectId, issueId, new IssueRequest("Assigned verification issue", null,
                IssuePriority.MEDIUM, member.getId(), null), owner.getEmail());
        settings.requestLeave(projectId, member.getEmail());
        settings.removeMember(projectId, member.getId(), owner.getEmail());
        entityManager.flush(); entityManager.clear();
        assertNull(issues.findById(issueId).orElseThrow().getAssignee());
        assertEquals(LeaveRequestStatus.CANCELLED, requests.findById(request.id()).orElseThrow().getStatus());
        assertEquals(1, comments.findByIssueIdOrderByCreatedAtAscIdAsc(issueId).size());
        projectService.delete(projectId, owner.getEmail());
        entityManager.flush(); entityManager.clear();
        assertFalse(projects.existsById(projectId));
        assertTrue(requests.findByProjectIdOrderByRequestedAtDesc(projectId).isEmpty());
        assertTrue(activities.findByIssueIdOrderByCreatedAtDescIdDesc(issueId).isEmpty());
        assertTrue(comments.findByIssueIdOrderByCreatedAtAscIdAsc(issueId).isEmpty());
        // Spring rolls back the entire test, including the temporary users.
    }
}
