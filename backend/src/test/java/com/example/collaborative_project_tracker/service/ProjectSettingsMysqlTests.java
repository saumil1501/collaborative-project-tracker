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

    private AppUser user(String name) {
        AppUser user = new AppUser(); user.setName(name);
        user.setEmail("settings-check-" + UUID.randomUUID() + "@example.invalid");
        user.setPassword("unused-test-hash"); return users.save(user);
    }

    @Test
    void liveStatusChangesRequireOwnerOrCurrentAssignee() {
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
        entityManager.flush(); entityManager.clear();
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
