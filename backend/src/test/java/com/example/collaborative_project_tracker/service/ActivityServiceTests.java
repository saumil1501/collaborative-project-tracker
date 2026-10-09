package com.example.collaborative_project_tracker.service;

import com.example.collaborative_project_tracker.dto.*;
import com.example.collaborative_project_tracker.model.*;
import com.example.collaborative_project_tracker.repository.*;
import org.junit.jupiter.api.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ActivityServiceTests {
    private IssueActivityRepository activities;
    private IssueRepository issues;
    private UserRepository users;
    private ProjectRepository projects;
    private ProjectMembershipRepository projectMemberships;
    private MembershipService memberships;
    private IssueCommentRepository comments;
    private ActivityService service;
    private IssueService issueService;
    private Issue issue;
    private Project project;
    private AppUser actor;
    private List<IssueActivity> recorded;

    @BeforeEach
    void setup() {
        activities = mock(IssueActivityRepository.class); issues = mock(IssueRepository.class);
        users = mock(UserRepository.class); projects = mock(ProjectRepository.class);
        projectMemberships = mock(ProjectMembershipRepository.class); memberships = mock(MembershipService.class);
        comments = mock(IssueCommentRepository.class);
        service = new ActivityService(activities, issues, users, memberships);
        issueService = new IssueService(issues, projects, projectMemberships, users, memberships, comments, activities, service);
        actor = new AppUser(); actor.setId(7L); actor.setName("Sam"); actor.setEmail("sam@example.test");
        project = new Project(); project.setId(1L); project.setOwner(actor);
        issue = new Issue(); issue.setId(2L); issue.setProject(project); issue.setTitle("Original");
        issue.setDescription("Old details"); issue.setCreatedAt(LocalDateTime.now());
        when(issues.findById(2L)).thenReturn(Optional.of(issue));
        when(projects.findById(1L)).thenReturn(Optional.of(project));
        when(users.findByEmailIgnoreCase(actor.getEmail())).thenReturn(Optional.of(actor));
        recorded = new ArrayList<>();
        when(activities.save(any())).thenAnswer(invocation -> {
            IssueActivity activity = invocation.getArgument(0); activity.setId((long) recorded.size() + 1);
            activity.setCreatedAt(Instant.now()); recorded.add(activity); return activity;
        });
        when(issues.save(any())).thenAnswer(invocation -> {
            Issue saved = invocation.getArgument(0); saved.setId(2L); saved.setCreatedAt(LocalDateTime.now()); return saved;
        });
    }

    @Test
    void creationRecordsAuthenticatedActorAndTitle() {
        issueService.create(1L, new IssueRequest(" New issue ", null, null, null, null), actor.getEmail());
        assertEquals(1, recorded.size());
        assertEquals(ActivityField.CREATED, recorded.getFirst().getField());
        assertSame(actor, recorded.getFirst().getActor());
        assertEquals("New issue", recorded.getFirst().getNewValue());
        assertNull(recorded.getFirst().getOldValue());
    }

    @Test
    void statusMoveRecordsBothValuesAndRepeatedMoveCreatesNoEntry() {
        issueService.updateStatus(1L, 2L, new UpdateIssueStatusRequest(IssueStatus.IN_PROGRESS), actor.getEmail());
        issueService.updateStatus(1L, 2L, new UpdateIssueStatusRequest(IssueStatus.IN_PROGRESS), actor.getEmail());
        assertEquals(1, recorded.size());
        assertEquals(ActivityField.STATUS, recorded.getFirst().getField());
        assertEquals("TODO", recorded.getFirst().getOldValue());
        assertEquals("IN_PROGRESS", recorded.getFirst().getNewValue());
    }

    @Test
    void capturesEachChangedFieldAndUnassignment() {
        issue.setAssignee(actor); issue.setDueDate(LocalDate.of(2026, 10, 10));
        issueService.update(1L, 2L, new IssueRequest("Updated", "New details", IssuePriority.HIGH, null, null), actor.getEmail());
        assertEquals(Set.of(ActivityField.TITLE, ActivityField.DESCRIPTION, ActivityField.PRIORITY, ActivityField.ASSIGNEE, ActivityField.DUE_DATE),
                new HashSet<>(recorded.stream().map(IssueActivity::getField).toList()));
        var assignment = recorded.stream().filter(event -> event.getField() == ActivityField.ASSIGNEE).findFirst().orElseThrow();
        assertEquals("Sam (#7)", assignment.getOldValue()); assertNull(assignment.getNewValue());
        var dueDate = recorded.stream().filter(event -> event.getField() == ActivityField.DUE_DATE).findFirst().orElseThrow();
        assertEquals("2026-10-10", dueDate.getOldValue()); assertNull(dueDate.getNewValue());
        assertEquals("New details", recorded.stream().filter(event -> event.getField() == ActivityField.DESCRIPTION).findFirst().orElseThrow().getNewValue());
    }

    @Test
    void capturesAssignmentEvenWhenTwoUsersHaveTheSameName() {
        issue.setAssignee(actor);
        AppUser other = new AppUser(); other.setId(8L); other.setName("Sam");
        when(projectMemberships.existsByProjectIdAndUserId(1L, 8L)).thenReturn(true);
        when(users.findById(8L)).thenReturn(Optional.of(other));
        issueService.update(1L, 2L, new IssueRequest("Original", "Old details", IssuePriority.MEDIUM, 8L, null), actor.getEmail());
        assertEquals(1, recorded.size());
        assertEquals("Sam (#7)", recorded.getFirst().getOldValue());
        assertEquals("Sam (#8)", recorded.getFirst().getNewValue());
    }

    @Test
    void unchangedUpdatesCreateNoHistory() {
        issueService.update(1L, 2L, new IssueRequest(" Original ", "Old details", IssuePriority.MEDIUM, null, null), actor.getEmail());
        assertTrue(recorded.isEmpty());
    }

    @Test
    void invalidAssigneeIsRejectedBeforeWritingHistoryOrMutatingIssue() {
        assertThrows(ResponseStatusException.class, () -> issueService.update(1L, 2L,
                new IssueRequest("Changed", "Changed", IssuePriority.HIGH, 999L, null), actor.getEmail()));
        assertTrue(recorded.isEmpty()); assertEquals("Original", issue.getTitle());
    }

    @Test
    void authorizedMembersReadHistoryInRepositoryOrder() {
        service.record(issue, actor.getEmail(), ActivityField.CREATED, null, "Original");
        service.record(issue, actor.getEmail(), ActivityField.STATUS, "TODO", "DONE");
        when(activities.findByIssueIdOrderByCreatedAtDescIdDesc(2L)).thenReturn(List.of(recorded.get(1), recorded.get(0)));
        var response = service.list(1L, 2L, "member@example.test");
        assertEquals(ActivityField.STATUS, response.getFirst().field());
        assertEquals("Sam", response.getFirst().actorName());
        verify(memberships).requireMember(1L, "member@example.test");
    }

    @Test
    void outsidersCannotReadHistory() {
        doThrow(new ResponseStatusException(HttpStatus.NOT_FOUND)).when(memberships).requireMember(1L, "outsider@example.test");
        assertThrows(ResponseStatusException.class, () -> service.list(1L, 2L, "outsider@example.test"));
        verifyNoInteractions(activities, issues);
    }

    @Test
    void issueMustBelongToTheRequestedProject() {
        project.setId(99L);
        assertEquals(HttpStatus.NOT_FOUND, assertThrows(ResponseStatusException.class,
                () -> service.list(1L, 2L, actor.getEmail())).getStatusCode());
        verifyNoInteractions(activities);
    }

    @Test
    void existingIssuesHaveNoInventedHistory() {
        when(activities.findByIssueIdOrderByCreatedAtDescIdDesc(2L)).thenReturn(List.of());
        assertTrue(service.list(1L, 2L, actor.getEmail()).isEmpty());
        verify(activities, never()).save(any());
    }

    @Test
    void issueDeletionRemovesActivityBeforeDeletingTheIssue() {
        issueService.delete(1L, 2L, actor.getEmail());
        var order = inOrder(activities, issues);
        order.verify(activities).deleteAllByIssueId(2L); order.verify(issues).delete(issue);
    }

    @Test
    void projectDeletionRemovesActivityBeforeDeletingItsIssues() {
        new ProjectService(projects, users, projectMemberships, issues, comments, activities).delete(1L, actor.getEmail());
        var order = inOrder(activities, issues, projects);
        order.verify(activities).deleteAllByProjectId(1L); order.verify(issues).deleteByProjectId(1L); order.verify(projects).delete(project);
    }
}
