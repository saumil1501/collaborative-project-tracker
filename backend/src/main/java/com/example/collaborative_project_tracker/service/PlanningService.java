package com.example.collaborative_project_tracker.service;

import com.example.collaborative_project_tracker.dto.*;
import com.example.collaborative_project_tracker.model.*;
import com.example.collaborative_project_tracker.repository.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.time.Instant;
import java.util.*;

@Service
public class PlanningService {
    private final ProjectRepository projects;
    private final IssueRepository issues;
    private final SprintRepository sprints;
    private final MembershipService membership;
    private final ActivityService activity;
    public PlanningService(ProjectRepository projects, IssueRepository issues, SprintRepository sprints,
                           MembershipService membership, ActivityService activity) {
        this.projects = projects; this.issues = issues; this.sprints = sprints; this.membership = membership; this.activity = activity;
    }
    @Transactional(readOnly = true)
    public List<SprintResponse> list(Long projectId, String email) {
        membership.requireMember(projectId, email);
        return sprints.findByProjectIdOrderByIdDesc(projectId).stream().map(this::response).toList();
    }
    @Transactional
    public SprintResponse create(Long projectId, SprintRequest request, String email) {
        Project project = ownerLock(projectId, email); validate(request);
        Sprint sprint = new Sprint(); sprint.setProject(project); apply(sprint, request);
        return response(sprints.save(sprint));
    }
    @Transactional
    public SprintResponse update(Long projectId, Long sprintId, SprintRequest request, String email) {
        ownerLock(projectId, email); Sprint sprint = getSprint(projectId, sprintId);
        requireState(sprint, SprintStatus.PLANNED); validate(request); apply(sprint, request);
        return response(sprint);
    }
    @Transactional
    public SprintResponse start(Long projectId, Long sprintId, String email) {
        ownerLock(projectId, email); Sprint sprint = getSprint(projectId, sprintId);
        requireState(sprint, SprintStatus.PLANNED);
        if (sprints.existsByProjectIdAndStatus(projectId, SprintStatus.ACTIVE)) throw conflict("Complete the active sprint before starting another");
        List<Issue> scope = scope(projectId, sprintId);
        if (scope.stream().noneMatch(issue -> issue.getStatus() != IssueStatus.DONE)) throw conflict("Add at least one unfinished issue before starting the sprint");
        sprint.setCommittedIssueCount(scope.size());
        sprint.setCommittedPoints(scope.stream().mapToInt(issue -> issue.getStoryPoints() != null ? issue.getStoryPoints() : 0).sum());
        sprint.setStatus(SprintStatus.ACTIVE); sprint.setStartedAt(Instant.now());
        return response(sprint);
    }
    @Transactional
    public SprintResponse complete(Long projectId, Long sprintId, String email) {
        ownerLock(projectId, email); Sprint sprint = getSprint(projectId, sprintId); requireState(sprint, SprintStatus.ACTIVE);
        List<Issue> scope = scope(projectId, sprintId);
        long rank = issues.highestPlanningRank(projectId);
        for (Issue issue : scope) {
            sprint.getSnapshots().add(new SprintSnapshot(issue));
            activity.record(issue, email, ActivityField.SPRINT, label(sprint), issue.getStatus() == IssueStatus.DONE ? "Completed in " + label(sprint) : "Backlog (sprint completed)");
            issue.setSprint(null);
            if (issue.getStatus() != IssueStatus.DONE) issue.setPlanningRank(++rank);
        }
        sprint.setStatus(SprintStatus.COMPLETED); sprint.setCompletedAt(Instant.now());
        return response(sprint);
    }
    @Transactional
    public void delete(Long projectId, Long sprintId, String email) {
        ownerLock(projectId, email); Sprint sprint = getSprint(projectId, sprintId); requireState(sprint, SprintStatus.PLANNED);
        long rank = issues.highestPlanningRank(projectId);
        for (Issue issue : scope(projectId, sprintId)) {
            activity.record(issue, email, ActivityField.SPRINT, label(sprint), issue.getStatus() == IssueStatus.DONE ? "Completed work (planned sprint deleted)" : "Backlog (planned sprint deleted)");
            issue.setSprint(null); issue.setPlanningRank(++rank);
        }
        // Detach issue foreign keys before deleting the sprint.
        issues.flush(); sprints.delete(sprint);
    }
    @Transactional
    public void move(Long projectId, Long issueId, MoveIssueSprintRequest request, String email) {
        ownerLock(projectId, email);
        Issue issue = issues.findById(issueId).filter(item -> item.getProject().getId().equals(projectId)).orElseThrow(this::missing);
        if (!issue.isPlannable()) throw conflict("Plan stories, tasks and bugs; subtasks inherit the parent sprint and epics span sprints");
        Sprint target = request.sprintId() != null ? getSprint(projectId, request.sprintId()) : null;
        if (target != null && target.getStatus() == SprintStatus.COMPLETED) throw conflict("Completed sprints are immutable");
        Long previousId = issue.getSprint() != null ? issue.getSprint().getId() : null;
        if (Objects.equals(previousId, request.sprintId())) return;
        if (issue.getStatus() == IssueStatus.DONE) throw conflict("Reopen the issue before changing its sprint");
        if (issue.getSprint() != null && issue.getSprint().getStatus() == SprintStatus.COMPLETED) throw conflict("Completed sprints are immutable");
        activity.record(issue, email, ActivityField.SPRINT, issue.getSprint() != null ? label(issue.getSprint()) : "Backlog", target != null ? label(target) : "Backlog");
        issue.setSprint(target); issue.setPlanningRank(issues.highestPlanningRank(projectId) + 1);
    }
    @Transactional
    public void reorder(Long projectId, BacklogOrderRequest request, String email) {
        ownerLock(projectId, email);
        List<Issue> backlog = issues.findByProjectIdOrderByCreatedAtDesc(projectId).stream()
                .filter(issue -> issue.isPlannable() && issue.getSprint() == null && issue.getStatus() != IssueStatus.DONE).toList();
        List<Long> ids = request.issueIds();
        if (ids == null || ids.size() != new HashSet<>(ids).size() || !new HashSet<>(ids).equals(new HashSet<>(backlog.stream().map(Issue::getId).toList())))
            throw conflict("The backlog changed. Refresh and reorder the current issues");
        Map<Long, Issue> byId = new HashMap<>(); backlog.forEach(issue -> byId.put(issue.getId(), issue));
        for (int index = 0; index < ids.size(); index++) byId.get(ids.get(index)).setPlanningRank((long) index + 1);
    }
    private Project ownerLock(Long projectId, String email) {
        Project project = projects.findLockedById(projectId).orElseThrow(this::missing);
        membership.requireOwner(projectId, email); return project;
    }
    private Sprint getSprint(Long projectId, Long sprintId) {
        return sprints.findById(sprintId).filter(sprint -> sprint.getProject().getId().equals(projectId)).orElseThrow(this::missing);
    }
    private List<Issue> scope(Long projectId, Long sprintId) {
        return issues.findByProjectIdOrderByCreatedAtDesc(projectId).stream()
            .filter(issue -> issue.getSprint() != null && Objects.equals(issue.getSprint().getId(), sprintId))
            .sorted(Comparator.comparing(issue -> issue.getPlanningRank() != null ? issue.getPlanningRank() : issue.getId())).toList();
    }
    private void validate(SprintRequest request) {
        if (request.name() == null || request.name().isBlank() || request.name().trim().length() > 150 || (request.goal() != null && request.goal().length() > 1000))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Provide a sprint name (up to 150 characters) and a goal of up to 1000 characters");
        if (request.startDate() == null || request.endDate() == null || request.endDate().isBefore(request.startDate()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Sprint end date must be on or after its start date");
    }
    private void apply(Sprint sprint, SprintRequest request) {
        sprint.setName(request.name().trim()); sprint.setGoal(request.goal() != null ? request.goal().trim() : null);
        sprint.setStartDate(request.startDate()); sprint.setEndDate(request.endDate());
    }
    private String label(Sprint sprint) { return sprint.getName() + " (#" + sprint.getId() + ")"; }
    private void requireState(Sprint sprint, SprintStatus status) { if (sprint.getStatus() != status) throw conflict("This sprint is no longer " + status.name().toLowerCase()); }
    private ResponseStatusException conflict(String reason) { return new ResponseStatusException(HttpStatus.CONFLICT, reason); }
    private ResponseStatusException missing() { return new ResponseStatusException(HttpStatus.NOT_FOUND); }
    private SprintResponse response(Sprint sprint) {
        return new SprintResponse(sprint.getId(), sprint.getName(), sprint.getGoal(), sprint.getStartDate(), sprint.getEndDate(), sprint.getStatus(),
            sprint.getStartedAt(), sprint.getCompletedAt(), sprint.getCommittedIssueCount(), sprint.getCommittedPoints(),
            sprint.getSnapshots().stream().map(item -> new SprintResponse.Snapshot(item.getIssueId(), item.getIssueKey(), item.getTitle(), item.getStatus(), item.getStoryPoints(), item.getAssigneeName())).toList());
    }
}
