package com.example.collaborative_project_tracker.service;

import com.example.collaborative_project_tracker.dto.*;
import com.example.collaborative_project_tracker.model.*;
import com.example.collaborative_project_tracker.repository.*;
import org.junit.jupiter.api.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.time.Instant;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ProjectSettingsServiceTests {
    private ProjectRepository projects;
    private ProjectMembershipRepository memberships;
    private ProjectLeaveRequestRepository requests;
    private UserRepository users;
    private IssueRepository issues;
    private ActivityService activity;
    private ProjectSettingsService service;
    private Project project;
    private AppUser owner, member, other;
    private ProjectMembership ownerMembership, memberMembership;
    private ProjectLeaveRequest request;
    private Issue assigned;

    @BeforeEach
    void setup() {
        projects = mock(ProjectRepository.class); memberships = mock(ProjectMembershipRepository.class);
        requests = mock(ProjectLeaveRequestRepository.class); users = mock(UserRepository.class);
        issues = mock(IssueRepository.class); activity = mock(ActivityService.class);
        service = new ProjectSettingsService(projects, memberships, requests, users, issues,
                new MembershipService(memberships, projects, users), activity);
        owner = user(1L, "owner@example.test"); member = user(2L, "member@example.test"); other = user(3L, "other@example.test");
        project = new Project(); project.setId(10L); project.setName("Original"); project.setOwner(owner);
        ownerMembership = membership(owner, ProjectRole.OWNER); memberMembership = membership(member, ProjectRole.MEMBER);
        when(projects.findById(10L)).thenReturn(Optional.of(project));
        when(projects.findLockedById(10L)).thenReturn(Optional.of(project));
        when(memberships.findByProjectIdAndUserId(10L, 1L)).thenReturn(Optional.of(ownerMembership));
        when(memberships.findByProjectIdAndUserId(10L, 2L)).thenReturn(Optional.of(memberMembership));
        when(memberships.existsByProjectIdAndUserId(10L, 1L)).thenReturn(true);
        when(memberships.existsByProjectIdAndUserId(10L, 2L)).thenReturn(true);
        request = new ProjectLeaveRequest(); request.setId(20L); request.setProject(project); request.setUser(member);
        request.setStatus(LeaveRequestStatus.PENDING); request.setRequestedAt(Instant.now());
        when(requests.findByIdAndProjectId(20L, 10L)).thenReturn(Optional.of(request));
        when(requests.save(any())).thenAnswer(invocation -> { ProjectLeaveRequest saved = invocation.getArgument(0); saved.setId(20L); return saved; });
        assigned = new Issue(); assigned.setId(30L); assigned.setProject(project); assigned.setAssignee(member);
        when(issues.findByProjectIdAndAssigneeId(10L, 2L)).thenReturn(List.of(assigned));
    }
    private AppUser user(Long id, String email) {
        AppUser user = new AppUser(); user.setId(id); user.setName("User " + id); user.setEmail(email);
        when(users.findByEmailIgnoreCase(email)).thenReturn(Optional.of(user)); return user;
    }
    private ProjectMembership membership(AppUser user, ProjectRole role) {
        ProjectMembership membership = new ProjectMembership(); membership.setProject(project); membership.setUser(user); membership.setRole(role); return membership;
    }
    private void assertStatus(HttpStatus status, Runnable action) {
        assertEquals(status, assertThrows(ResponseStatusException.class, action::run).getStatusCode());
    }

    @Test void ownerCanEditDetailsButMembersCannot() {
        assertEquals("Updated", service.updateProject(10L, new CreateProjectRequest(" Updated ", " Details "), owner.getEmail()).name());
        assertEquals("Details", project.getDescription());
        assertStatus(HttpStatus.FORBIDDEN, () -> service.updateProject(10L, new CreateProjectRequest("Forbidden", null), member.getEmail()));
        assertEquals("Updated", project.getName());
    }
    @Test void outsidersCannotReadProjectOrRequests() {
        assertStatus(HttpStatus.NOT_FOUND, () -> service.getProject(10L, other.getEmail()));
        assertStatus(HttpStatus.NOT_FOUND, () -> service.listRequests(10L, other.getEmail()));
    }
    @Test void memberCanRequestLeaveWithoutLosingAccessOrAssignments() {
        var result = service.requestLeave(10L, member.getEmail());
        assertEquals(LeaveRequestStatus.PENDING, result.status());
        assertSame(member, assigned.getAssignee());
        verify(memberships, never()).delete(any(ProjectMembership.class)); verifyNoInteractions(activity, issues);
    }
    @Test void ownersCannotRequestToLeave() {
        assertStatus(HttpStatus.FORBIDDEN, () -> service.requestLeave(10L, owner.getEmail()));
        verify(requests, never()).save(any());
    }
    @Test void preventsDuplicatePendingRequests() {
        when(requests.findByProjectIdAndUserId(10L, 2L)).thenReturn(Optional.of(request));
        assertStatus(HttpStatus.CONFLICT, () -> service.requestLeave(10L, member.getEmail()));
    }
    @Test void rejectedRequestCanBeResubmitted() {
        request.setStatus(LeaveRequestStatus.REJECTED); request.setResolvedAt(Instant.now());
        when(requests.findByProjectIdAndUserId(10L, 2L)).thenReturn(Optional.of(request));
        assertEquals(LeaveRequestStatus.PENDING, service.requestLeave(10L, member.getEmail()).status());
        assertNull(request.getResolvedAt());
    }
    @Test void requesterCanCancelWithoutLosingMembership() {
        assertEquals(LeaveRequestStatus.CANCELLED, service.cancelLeave(10L, 20L, member.getEmail()).status());
        assertNotNull(request.getResolvedAt()); verify(memberships, never()).delete(any(ProjectMembership.class));
    }
    @Test void ownerCannotCancelSomeoneElsesRequest() {
        assertStatus(HttpStatus.FORBIDDEN, () -> service.cancelLeave(10L, 20L, owner.getEmail()));
        assertEquals(LeaveRequestStatus.PENDING, request.getStatus());
    }
    @Test void membersCannotApproveRejectOrRemoveMembers() {
        assertStatus(HttpStatus.FORBIDDEN, () -> service.decideLeave(10L, 20L, true, member.getEmail()));
        assertStatus(HttpStatus.FORBIDDEN, () -> service.decideLeave(10L, 20L, false, member.getEmail()));
        assertStatus(HttpStatus.FORBIDDEN, () -> service.removeMember(10L, 2L, member.getEmail()));
        verify(memberships, never()).delete(any(ProjectMembership.class));
    }
    @Test void approvalRemovesMemberAndUnassignsIssuesWithActivity() {
        assertEquals(LeaveRequestStatus.APPROVED, service.decideLeave(10L, 20L, true, owner.getEmail()).status());
        assertNull(assigned.getAssignee()); verify(memberships).delete(memberMembership);
        verify(activity).record(assigned, owner.getEmail(), ActivityField.ASSIGNEE, "User 2 (#2)", null);
    }
    @Test void rejectionKeepsMembershipAndAssignments() {
        assertEquals(LeaveRequestStatus.REJECTED, service.decideLeave(10L, 20L, false, owner.getEmail()).status());
        assertSame(member, assigned.getAssignee()); verify(memberships, never()).delete(any(ProjectMembership.class));
        verifyNoInteractions(activity, issues);
    }
    @Test void directRemovalCancelsPendingRequestAndUnassignsIssues() {
        when(requests.findByProjectIdAndUserId(10L, 2L)).thenReturn(Optional.of(request));
        service.removeMember(10L, 2L, owner.getEmail());
        assertNull(assigned.getAssignee()); assertEquals(LeaveRequestStatus.CANCELLED, request.getStatus());
        verify(memberships).delete(memberMembership);
    }
    @Test void ownerCannotRemoveThemselves() {
        assertStatus(HttpStatus.FORBIDDEN, () -> service.removeMember(10L, 1L, owner.getEmail()));
    }
    @Test void resolvedRequestsCannotBeDecidedOrCancelledAgain() {
        request.setStatus(LeaveRequestStatus.CANCELLED);
        assertStatus(HttpStatus.CONFLICT, () -> service.decideLeave(10L, 20L, true, owner.getEmail()));
        assertStatus(HttpStatus.CONFLICT, () -> service.cancelLeave(10L, 20L, member.getEmail()));
    }
    @Test void crossProjectRequestsAreRejected() {
        when(requests.findByIdAndProjectId(20L, 10L)).thenReturn(Optional.empty());
        assertStatus(HttpStatus.NOT_FOUND, () -> service.decideLeave(10L, 20L, true, owner.getEmail()));
    }
    @Test void ownersSeeAllRequestsMembersOnlyTheirOwn() {
        when(requests.findByProjectIdOrderByRequestedAtDesc(10L)).thenReturn(List.of(request));
        when(requests.findByProjectIdAndUserId(10L, 2L)).thenReturn(Optional.of(request));
        assertEquals(1, service.listRequests(10L, owner.getEmail()).size());
        assertEquals(2L, service.listRequests(10L, member.getEmail()).getFirst().userId());
        verify(requests, times(1)).findByProjectIdOrderByRequestedAtDesc(10L);
    }
}
