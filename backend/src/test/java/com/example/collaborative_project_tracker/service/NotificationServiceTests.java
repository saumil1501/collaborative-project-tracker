package com.example.collaborative_project_tracker.service;

import com.example.collaborative_project_tracker.model.*;
import com.example.collaborative_project_tracker.repository.*;
import org.junit.jupiter.api.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.time.Instant;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class NotificationServiceTests {
    private NotificationRepository notifications;
    private UserRepository users;
    private ProjectMembershipRepository memberships;
    private ProjectRepository projects;
    private IssueRepository issues;
    private NotificationService service;
    private AppUser owner, assignee, other;
    private Project project;
    private Issue issue;
    private List<Notification> sent;

    @BeforeEach void setup() {
        notifications = mock(NotificationRepository.class); users = mock(UserRepository.class);
        memberships = mock(ProjectMembershipRepository.class); projects = mock(ProjectRepository.class);
        issues = mock(IssueRepository.class);
        service = new NotificationService(notifications, users, memberships, projects, issues);
        owner = user(1); assignee = user(2); other = user(3);
        project = new Project(); project.setId(10L); project.setOwner(owner); project.setName("Workspace");
        issue = new Issue(); issue.setId(20L); issue.setProject(project); issue.setAssignee(assignee); issue.setTitle("Task");
        when(memberships.existsByProjectIdAndUserId(eq(10L), anyLong())).thenReturn(true);
        when(projects.existsById(10L)).thenReturn(true);
        when(issues.findById(20L)).thenReturn(Optional.of(issue));
        sent = new ArrayList<>();
        when(notifications.save(any())).thenAnswer(invocation -> {
            Notification n = invocation.getArgument(0); n.setId((long) sent.size()+1); n.setCreatedAt(Instant.now()); sent.add(n); return n;
        });
    }
    private AppUser user(long id) {
        AppUser user = new AppUser(); user.setId(id); user.setName("User " + id); user.setEmail("user" + id + "@example.test");
        when(users.findByEmailIgnoreCase(user.getEmail())).thenReturn(Optional.of(user)); return user;
    }

    @Test void assignmentsNotifyOnlyTheRecipientAndExcludeSelfAndUnassigned() {
        service.assigned(issue, owner.getEmail());
        assertEquals(1, sent.size()); assertSame(assignee, sent.getFirst().getRecipient());
        assertEquals(NotificationType.ASSIGNED, sent.getFirst().getType());
        service.assigned(issue, assignee.getEmail()); issue.setAssignee(null); service.assigned(issue, owner.getEmail());
        assertEquals(1, sent.size());
    }
    @Test void statusNotifiesOwnerExceptOwnActions() {
        service.statusChanged(issue, assignee, IssueStatus.DONE);
        service.statusChanged(issue, owner, IssueStatus.TODO);
        assertEquals(1, sent.size()); assertSame(owner, sent.getFirst().getRecipient());
        assertTrue(sent.getFirst().getMessage().contains("done"));
    }
    @Test void commentsNotifyOwnerAndAssigneeExcludingAuthorAndDuplicateRecipients() {
        service.commented(issue, other);
        assertEquals(List.of(owner, assignee), sent.stream().map(Notification::getRecipient).toList());
        sent.clear(); service.commented(issue, assignee);
        assertEquals(1, sent.size()); assertSame(owner, sent.getFirst().getRecipient());
        sent.clear(); issue.setAssignee(owner); service.commented(issue, other);
        assertEquals(1, sent.size());
    }
    @Test void noIssueNotificationsAreSentToRemovedMembers() {
        when(memberships.existsByProjectIdAndUserId(10L, 2L)).thenReturn(false);
        service.assigned(issue, owner.getEmail());
        assertTrue(sent.isEmpty());
    }
    @Test void leaveDecisionsStillNotifyAFormerMember() {
        service.leaveRequested(project, assignee);
        when(memberships.existsByProjectIdAndUserId(10L, 2L)).thenReturn(false);
        service.leaveDecided(project, assignee, true, owner.getEmail());
        service.leaveDecided(project, assignee, false, owner.getEmail());
        assertEquals(List.of(NotificationType.LEAVE_REQUESTED, NotificationType.LEAVE_APPROVED, NotificationType.LEAVE_REJECTED),
                sent.stream().map(Notification::getType).toList());
    }
    @Test void inboxIsScopedAndDisablesDeletedOrInaccessibleTargets() {
        service.assigned(issue, owner.getEmail());
        Notification n = sent.getFirst();
        when(notifications.findByRecipientIdOrderByCreatedAtDescIdDesc(eq(2L), any())).thenReturn(List.of(n));
        when(notifications.countByRecipientIdAndReadAtIsNull(2L)).thenReturn(4L);
        assertEquals(20L, service.inbox(assignee.getEmail()).items().getFirst().issueId());
        assertEquals(4, service.inbox(assignee.getEmail()).unreadCount());
        when(issues.findById(20L)).thenReturn(Optional.empty());
        assertNull(service.inbox(assignee.getEmail()).items().getFirst().projectId());
        when(memberships.existsByProjectIdAndUserId(10L, 2L)).thenReturn(false);
        assertNull(service.inbox(assignee.getEmail()).items().getFirst().issueId());
        verify(notifications, never()).findByRecipientIdOrderByCreatedAtDescIdDesc(eq(1L), any());
    }
    @Test void usersCannotMarkSomeoneElsesNotificationRead() {
        when(notifications.findByIdAndRecipientId(99L, 1L)).thenReturn(Optional.empty());
        assertEquals(HttpStatus.NOT_FOUND, assertThrows(ResponseStatusException.class,
                () -> service.markRead(99L, owner.getEmail())).getStatusCode());
    }
    @Test void markingReadIsIdempotentAndMarkAllIsRecipientScoped() {
        service.assigned(issue, owner.getEmail()); Notification n = sent.getFirst();
        when(notifications.findByIdAndRecipientId(n.getId(), 2L)).thenReturn(Optional.of(n));
        service.markRead(n.getId(), assignee.getEmail()); Instant readAt = n.getReadAt();
        service.markRead(n.getId(), assignee.getEmail()); assertEquals(readAt, n.getReadAt());
        service.markAllRead(assignee.getEmail()); verify(notifications).markAllRead(eq(2L), any());
    }
}
