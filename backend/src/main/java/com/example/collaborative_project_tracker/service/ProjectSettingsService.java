package com.example.collaborative_project_tracker.service;

import com.example.collaborative_project_tracker.dto.*;
import com.example.collaborative_project_tracker.model.*;
import com.example.collaborative_project_tracker.repository.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.time.Instant;
import java.util.List;

@Service
public class ProjectSettingsService {
    private final ProjectRepository projects;
    private final ProjectMembershipRepository memberships;
    private final ProjectLeaveRequestRepository requests;
    private final UserRepository users;
    private final IssueRepository issues;
    private final MembershipService authorization;
    private final ActivityService activity;
    private final NotificationService notifications;

    public ProjectSettingsService(ProjectRepository projects, ProjectMembershipRepository memberships,
            ProjectLeaveRequestRepository requests, UserRepository users, IssueRepository issues,
            MembershipService authorization, ActivityService activity, NotificationService notifications) {
        this.projects = projects; this.memberships = memberships; this.requests = requests;
        this.users = users; this.issues = issues; this.authorization = authorization; this.activity = activity;
        this.notifications = notifications;
    }

    @Transactional(readOnly = true)
    public ProjectResponse getProject(Long projectId, String email) {
        authorization.requireMember(projectId, email);
        return projectResponse(projects.findById(projectId).orElseThrow(() -> missing()));
    }

    @Transactional
    public ProjectResponse updateProject(Long projectId, CreateProjectRequest request, String email) {
        Project project = lockProject(projectId);
        authorization.requireOwner(projectId, email);
        project.setName(request.name().trim());
        project.setDescription(request.description() == null ? null : request.description().trim());
        return projectResponse(project);
    }

    @Transactional(readOnly = true)
    public List<LeaveRequestResponse> listRequests(Long projectId, String email) {
        authorization.requireMember(projectId, email);
        AppUser user = currentUser(email);
        ProjectMembership membership = membership(projectId, user.getId());
        if (membership.getRole() == ProjectRole.OWNER) {
            return requests.findByProjectIdOrderByRequestedAtDesc(projectId).stream().map(this::response).toList();
        }
        return requests.findByProjectIdAndUserId(projectId, user.getId()).stream().map(this::response).toList();
    }

    @Transactional
    public LeaveRequestResponse requestLeave(Long projectId, String email) {
        Project project = lockProject(projectId);
        authorization.requireMember(projectId, email);
        AppUser user = currentUser(email);
        requireRemovable(project, membership(projectId, user.getId()));
        ProjectLeaveRequest request = requests.findByProjectIdAndUserId(projectId, user.getId()).orElseGet(ProjectLeaveRequest::new);
        if (request.getStatus() == LeaveRequestStatus.PENDING) throw conflict("A leave request is already pending");
        request.setProject(project); request.setUser(user); request.setStatus(LeaveRequestStatus.PENDING);
        request.setRequestedAt(Instant.now()); request.setResolvedAt(null);
        ProjectLeaveRequest saved = requests.save(request);
        notifications.leaveRequested(project, user);
        return response(saved);
    }

    @Transactional
    public LeaveRequestResponse cancelLeave(Long projectId, Long requestId, String email) {
        lockProject(projectId);
        authorization.requireMember(projectId, email);
        ProjectLeaveRequest request = request(projectId, requestId);
        if (!request.getUser().getId().equals(currentUser(email).getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the requester can cancel this request");
        }
        requirePending(request);
        resolve(request, LeaveRequestStatus.CANCELLED);
        return response(request);
    }

    @Transactional
    public LeaveRequestResponse decideLeave(Long projectId, Long requestId, boolean approve, String email) {
        Project project = lockProject(projectId);
        authorization.requireOwner(projectId, email);
        ProjectLeaveRequest request = request(projectId, requestId);
        requirePending(request);
        ProjectMembership membership = membership(projectId, request.getUser().getId());
        requireRemovable(project, membership);
        if (approve) removeMembership(projectId, membership, email);
        resolve(request, approve ? LeaveRequestStatus.APPROVED : LeaveRequestStatus.REJECTED);
        notifications.leaveDecided(project, request.getUser(), approve, email);
        return response(request);
    }

    @Transactional
    public void removeMember(Long projectId, Long userId, String email) {
        Project project = lockProject(projectId);
        authorization.requireOwner(projectId, email);
        ProjectMembership membership = membership(projectId, userId);
        requireRemovable(project, membership);
        removeMembership(projectId, membership, email);
        requests.findByProjectIdAndUserId(projectId, userId).filter(request -> request.getStatus() == LeaveRequestStatus.PENDING)
                .ifPresent(request -> resolve(request, LeaveRequestStatus.CANCELLED));
    }

    private void removeMembership(Long projectId, ProjectMembership membership, String email) {
        AppUser member = membership.getUser();
        for (Issue issue : issues.findByProjectIdAndAssigneeId(projectId, member.getId())) {
            activity.record(issue, email, ActivityField.ASSIGNEE, member.getName() + " (#" + member.getId() + ")", null);
            issue.setAssignee(null);
        }
        memberships.delete(membership);
    }

    private void requireRemovable(Project project, ProjectMembership membership) {
        if (membership.getRole() == ProjectRole.OWNER || project.getOwner().getId().equals(membership.getUser().getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "The owner cannot leave or be removed");
        }
    }
    private void requirePending(ProjectLeaveRequest request) {
        if (request.getStatus() != LeaveRequestStatus.PENDING) throw conflict("This request has already been resolved");
    }
    private void resolve(ProjectLeaveRequest request, LeaveRequestStatus status) {
        request.setStatus(status); request.setResolvedAt(Instant.now());
    }
    private Project lockProject(Long id) { return projects.findLockedById(id).orElseThrow(() -> missing()); }
    private ProjectMembership membership(Long projectId, Long userId) {
        return memberships.findByProjectIdAndUserId(projectId, userId).orElseThrow(() -> missing());
    }
    private ProjectLeaveRequest request(Long projectId, Long requestId) {
        return requests.findByIdAndProjectId(requestId, projectId).orElseThrow(() -> missing());
    }
    private AppUser currentUser(String email) {
        return users.findByEmailIgnoreCase(email).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
    }
    private ResponseStatusException missing() { return new ResponseStatusException(HttpStatus.NOT_FOUND); }
    private ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT, message); }
    private LeaveRequestResponse response(ProjectLeaveRequest request) {
        AppUser user = request.getUser();
        return new LeaveRequestResponse(request.getId(), user.getId(), user.getName(), user.getEmail(),
                request.getStatus(), request.getRequestedAt(), request.getResolvedAt());
    }
    private ProjectResponse projectResponse(Project project) {
        return new ProjectResponse(project.getId(), project.getName(), project.getDescription(), project.getOwner().getId(), project.getCreatedAt());
    }
}
