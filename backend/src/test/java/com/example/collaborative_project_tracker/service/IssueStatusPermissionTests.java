package com.example.collaborative_project_tracker.service;

import com.example.collaborative_project_tracker.dto.UpdateIssueStatusRequest;
import com.example.collaborative_project_tracker.dto.IssueRequest;
import com.example.collaborative_project_tracker.model.*;
import com.example.collaborative_project_tracker.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.util.Optional;
import java.time.LocalDate;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class IssueStatusPermissionTests {
    private IssueService service;
    private IssueRepository issues;
    private ProjectRepository projects;
    private UserRepository users;
    private MembershipService memberships;
    private ActivityService activity;
    private Project project;
    private Issue issue;
    private AppUser owner, assignee, other;
    private final UpdateIssueStatusRequest request = new UpdateIssueStatusRequest(IssueStatus.DONE);

    private AppUser user(long id) {
        AppUser user = new AppUser(); user.setId(id); user.setName("User " + id);
        user.setEmail("user" + id + "@example.test");
        when(users.findByEmailIgnoreCase(user.getEmail())).thenReturn(Optional.of(user));
        return user;
    }

    @BeforeEach
    void setup() {
        issues = mock(IssueRepository.class); projects = mock(ProjectRepository.class);
        users = mock(UserRepository.class); memberships = mock(MembershipService.class);
        activity = mock(ActivityService.class);
        service = new IssueService(issues, projects, mock(ProjectMembershipRepository.class), users,
                memberships, mock(IssueCommentRepository.class), mock(IssueActivityRepository.class), activity, mock(NotificationService.class));
        owner = user(1); assignee = user(2); other = user(3);
        project = new Project(); project.setId(10L); project.setOwner(owner);
        issue = new Issue(); issue.setId(20L); issue.setProject(project); issue.setAssignee(assignee);
        when(projects.findLockedById(10L)).thenReturn(Optional.of(project));
        when(issues.findById(20L)).thenReturn(Optional.of(issue));
    }

    @Test void ownerCanChangeAnotherMembersIssue() {
        assertEquals(IssueStatus.DONE, service.updateStatus(10L, 20L, request, owner.getEmail()).status());
        var order = inOrder(projects, memberships, issues);
        order.verify(projects).findLockedById(10L);
        order.verify(memberships).requireMember(10L, owner.getEmail());
        order.verify(issues).findById(20L);
    }

    @Test void currentAssigneeCanChangeStatus() {
        service.updateStatus(10L, 20L, request, assignee.getEmail());
        assertEquals(IssueStatus.DONE, issue.getStatus());
        verify(activity).record(issue, assignee.getEmail(), ActivityField.STATUS, "TODO", "DONE");
    }

    private void denied(AppUser actor, HttpStatus status) {
        assertEquals(status, assertThrows(ResponseStatusException.class,
                () -> service.updateStatus(10L, 20L, request, actor.getEmail())).getStatusCode());
        assertEquals(IssueStatus.TODO, issue.getStatus());
        verifyNoInteractions(activity);
    }

    @Test void otherMemberCannotChangeStatus() { denied(other, HttpStatus.FORBIDDEN); }
    @Test void formerAssigneeCannotChangeStatusAfterReassignment() {
        issue.setAssignee(other); denied(assignee, HttpStatus.FORBIDDEN);
    }
    @Test void memberCannotChangeUnassignedIssue() {
        issue.setAssignee(null); denied(assignee, HttpStatus.FORBIDDEN);
    }
    @Test void ownerCanChangeUnassignedIssue() {
        issue.setAssignee(null);
        assertEquals(IssueStatus.DONE, service.updateStatus(10L, 20L, request, owner.getEmail()).status());
    }
    @Test void removedAssigneeStillRequiresMembership() {
        doThrow(new ResponseStatusException(HttpStatus.NOT_FOUND)).when(memberships)
                .requireMember(10L, assignee.getEmail());
        denied(assignee, HttpStatus.NOT_FOUND);
        verifyNoInteractions(issues);
    }
    @Test void issueMustBelongToRequestedProject() {
        Project different = new Project(); different.setId(99L); issue.setProject(different);
        denied(owner, HttpStatus.NOT_FOUND);
    }

    @Test void membersIncludingAssigneeCannotEditAnyDetailsCreateOrDeleteIssues() {
        issue.setTitle("Original"); issue.setDescription("Original description");
        issue.setDueDate(LocalDate.of(2026, 10, 10));
        var changes = new IssueRequest("Changed", "Changed description", IssuePriority.HIGH,
                owner.getId(), LocalDate.of(2026, 11, 11));
        for (AppUser member : new AppUser[]{assignee, other}) {
            assertEquals(HttpStatus.FORBIDDEN, assertThrows(ResponseStatusException.class,
                    () -> service.update(10L, 20L, changes, member.getEmail())).getStatusCode());
            assertEquals(HttpStatus.FORBIDDEN, assertThrows(ResponseStatusException.class,
                    () -> service.create(10L, changes, member.getEmail())).getStatusCode());
            assertEquals(HttpStatus.FORBIDDEN, assertThrows(ResponseStatusException.class,
                    () -> service.delete(10L, 20L, member.getEmail())).getStatusCode());
        }
        assertEquals("Original", issue.getTitle());
        assertEquals("Original description", issue.getDescription());
        assertEquals(IssuePriority.MEDIUM, issue.getPriority());
        assertEquals(LocalDate.of(2026, 10, 10), issue.getDueDate());
        assertSame(assignee, issue.getAssignee());
        verifyNoInteractions(issues, activity);
    }

    @Test void membersCanStillViewIssues() {
        service.list(10L, assignee.getEmail());
        verify(memberships).requireMember(10L, assignee.getEmail());
        verify(issues).findByProjectIdOrderByCreatedAtDesc(10L);
    }
}
