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

class PlanningServiceTests {
    ProjectRepository projects; IssueRepository issues; SprintRepository sprints;
    MembershipService membership; ActivityService activity; PlanningService service;
    Project project; Sprint planned, other; Issue first, second;
    SprintRequest request = new SprintRequest(" Iteration 1 ", " Goal ", LocalDate.of(2026,10,10), LocalDate.of(2026,10,24));
    @BeforeEach void setup() {
        projects = mock(ProjectRepository.class); issues = mock(IssueRepository.class); sprints = mock(SprintRepository.class);
        membership = mock(MembershipService.class); activity = mock(ActivityService.class);
        service = new PlanningService(projects, issues, sprints, membership, activity);
        project = new Project(); project.setId(1L);
        planned = sprint(10L, project); other = sprint(11L, project);
        first = issue(1L); second = issue(2L);
        when(projects.findLockedById(1L)).thenReturn(Optional.of(project));
        when(sprints.findById(10L)).thenReturn(Optional.of(planned)); when(sprints.findById(11L)).thenReturn(Optional.of(other));
        when(issues.findById(1L)).thenReturn(Optional.of(first)); when(issues.findById(2L)).thenReturn(Optional.of(second));
        when(issues.findByProjectIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(first,second));
        when(issues.highestPlanningRank(1L)).thenReturn(20L);
        when(sprints.save(any())).thenAnswer(call -> { Sprint value = call.getArgument(0); value.setId(10L); return value; });
    }
    Sprint sprint(long id, Project project) { Sprint sprint = new Sprint(); sprint.setId(id); sprint.setProject(project); sprint.setName("Sprint " + id); return sprint; }
    Issue issue(long id) { Issue issue = new Issue(); issue.setId(id); issue.setProject(project); issue.setTitle("Issue " + id); issue.setStoryPoints(3); return issue; }
    void status(HttpStatus expected, Runnable action) { assertEquals(expected, assertThrows(ResponseStatusException.class, action::run).getStatusCode()); }
    @Test void createsAndEditsPlannedSprintWithValidatedDates() {
        var response = service.create(1L,request,"owner"); assertEquals("Iteration 1",response.name()); assertEquals("Goal",response.goal());
        service.update(1L,10L,request,"owner"); assertEquals(request.endDate(), planned.getEndDate());
        status(HttpStatus.BAD_REQUEST, () -> service.create(1L,new SprintRequest("Sprint",null,request.endDate(),request.startDate()),"owner"));
        status(HttpStatus.BAD_REQUEST, () -> service.create(1L,new SprintRequest(" ",null,null,null),"owner"));
    }
    @Test void allPlanningMutationsRequireOwnerUnderProjectLock() {
        doThrow(new ResponseStatusException(HttpStatus.FORBIDDEN)).when(membership).requireOwner(1L,"member");
        List<Runnable> changes = List.of(() -> service.create(1L,request,"member"), () -> service.update(1L,10L,request,"member"),
            () -> service.start(1L,10L,"member"), () -> service.complete(1L,10L,"member"), () -> service.delete(1L,10L,"member"),
            () -> service.move(1L,1L,new MoveIssueSprintRequest(10L),"member"), () -> service.reorder(1L,new BacklogOrderRequest(List.of(1L,2L)),"member"));
        changes.forEach(change -> status(HttpStatus.FORBIDDEN,change));
        verifyNoInteractions(issues,sprints,activity);
        var order = inOrder(projects,membership); order.verify(projects).findLockedById(1L); order.verify(membership).requireOwner(1L,"member");
    }
    @Test void membersCanReadButNonMembersCannot() {
        when(sprints.findByProjectIdOrderByIdDesc(1L)).thenReturn(List.of(planned));
        assertEquals(1,service.list(1L,"member").size()); verify(membership).requireMember(1L,"member");
        doThrow(new ResponseStatusException(HttpStatus.NOT_FOUND)).when(membership).requireMember(1L,"outsider");
        status(HttpStatus.NOT_FOUND,() -> service.list(1L,"outsider"));
    }
    @Test void rejectsForeignProjectIssuesAndSprints() {
        Project foreign = new Project(); foreign.setId(2L); other.setProject(foreign);
        status(HttpStatus.NOT_FOUND,() -> service.move(1L,1L,new MoveIssueSprintRequest(11L),"owner"));
        second.setProject(foreign); status(HttpStatus.NOT_FOUND,() -> service.move(1L,2L,new MoveIssueSprintRequest(null),"owner"));
        verifyNoInteractions(activity);
    }
    @Test void startCapturesCommitmentAndBlocksEmptyOrSecondActiveSprint() {
        status(HttpStatus.CONFLICT,() -> service.start(1L,10L,"owner"));
        first.setSprint(planned); second.setSprint(planned); second.setStoryPoints(null);
        var response = service.start(1L,10L,"owner"); assertEquals(SprintStatus.ACTIVE,response.status());
        assertEquals(2,response.committedIssueCount()); assertEquals(3,response.committedPoints()); assertNotNull(response.startedAt());
        status(HttpStatus.CONFLICT,() -> service.start(1L,10L,"owner"));
        when(sprints.existsByProjectIdAndStatus(1L,SprintStatus.ACTIVE)).thenReturn(true);
        status(HttpStatus.CONFLICT,() -> service.start(1L,11L,"owner"));
    }
    @Test void cannotStartWithOnlyDoneIssues() {
        first.setSprint(planned); first.setStatus(IssueStatus.DONE);
        status(HttpStatus.CONFLICT,() -> service.start(1L,10L,"owner"));
    }
    @Test void completionSnapshotsOutcomesAndReturnsUnfinishedWorkWithoutResettingStatus() {
        planned.setStatus(SprintStatus.ACTIVE); first.setSprint(planned); second.setSprint(planned);
        first.setStatus(IssueStatus.IN_PROGRESS); second.setStatus(IssueStatus.DONE);
        var response = service.complete(1L,10L,"owner");
        assertEquals(SprintStatus.COMPLETED,response.status()); assertEquals(2,response.snapshots().size());
        assertNull(first.getSprint()); assertNull(second.getSprint()); assertEquals(IssueStatus.IN_PROGRESS,first.getStatus());
        assertEquals(21L,first.getPlanningRank()); assertNotNull(response.completedAt());
        second.setTitle("Later title"); second.setStoryPoints(13); second.setStatus(IssueStatus.TODO);
        assertEquals("Issue 2",planned.getSnapshots().get(1).getTitle()); assertEquals(3,planned.getSnapshots().get(1).getStoryPoints());
        assertEquals(IssueStatus.DONE,planned.getSnapshots().get(1).getStatus());
        verify(activity).record(first,"owner",ActivityField.SPRINT,"Sprint 10 (#10)","Backlog (sprint completed)");
    }
    @Test void completedSprintsCannotBeEditedRestartedCompletedAgainDeletedOrAssigned() {
        planned.setStatus(SprintStatus.COMPLETED);
        status(HttpStatus.CONFLICT,() -> service.update(1L,10L,request,"owner"));
        status(HttpStatus.CONFLICT,() -> service.start(1L,10L,"owner"));
        status(HttpStatus.CONFLICT,() -> service.complete(1L,10L,"owner"));
        status(HttpStatus.CONFLICT,() -> service.delete(1L,10L,"owner"));
        status(HttpStatus.CONFLICT,() -> service.move(1L,1L,new MoveIssueSprintRequest(10L),"owner"));
    }
    @Test void movingIssuesAuditsMembershipAndNoopDoesNotAppendOrAudit() {
        service.move(1L,1L,new MoveIssueSprintRequest(10L),"owner"); assertSame(planned,first.getSprint()); assertEquals(21L,first.getPlanningRank());
        service.move(1L,1L,new MoveIssueSprintRequest(10L),"owner");
        verify(activity,times(1)).record(any(),anyString(),any(),any(),any());
        first.setStatus(IssueStatus.DONE); status(HttpStatus.CONFLICT,() -> service.move(1L,1L,new MoveIssueSprintRequest(null),"owner"));
        first.setStatus(IssueStatus.TODO); service.move(1L,1L,new MoveIssueSprintRequest(null),"owner"); assertNull(first.getSprint());
    }
    @Test void reorderRequiresExactlyTheCurrentUnfinishedBacklog() {
        service.reorder(1L,new BacklogOrderRequest(List.of(2L,1L)),"owner");
        assertEquals(1L,second.getPlanningRank()); assertEquals(2L,first.getPlanningRank());
        for (List<Long> ids : List.of(List.of(1L),List.of(1L,1L),List.of(1L,99L))) status(HttpStatus.CONFLICT,() -> service.reorder(1L,new BacklogOrderRequest(ids),"owner"));
        second.setStatus(IssueStatus.DONE); status(HttpStatus.CONFLICT,() -> service.reorder(1L,new BacklogOrderRequest(List.of(1L,2L)),"owner"));
        service.reorder(1L,new BacklogOrderRequest(List.of(1L)),"owner");
    }
    @Test void deletingPlannedSprintFlushesReturnedIssuesBeforeRemovingForeignKeyTarget() {
        first.setSprint(planned); second.setSprint(planned); second.setStatus(IssueStatus.DONE);
        service.delete(1L,10L,"owner"); assertNull(first.getSprint()); assertNull(second.getSprint()); assertEquals(IssueStatus.DONE,second.getStatus());
        verify(activity).record(second,"owner",ActivityField.SPRINT,"Sprint 10 (#10)","Completed work (planned sprint deleted)");
        var order = inOrder(issues,sprints); order.verify(issues).flush(); order.verify(sprints).delete(planned);
        other.setStatus(SprintStatus.ACTIVE); status(HttpStatus.CONFLICT,() -> service.delete(1L,11L,"owner"));
    }
    @Test void epicsAndSubtasksCannotBeIndependentlyAllocatedOrReordered() {
        first.setType(IssueType.EPIC); second.setType(IssueType.SUBTASK); second.setParent(first);
        status(HttpStatus.CONFLICT, () -> service.move(1L,1L,new MoveIssueSprintRequest(10L),"owner"));
        status(HttpStatus.CONFLICT, () -> service.move(1L,2L,new MoveIssueSprintRequest(10L),"owner"));
        status(HttpStatus.CONFLICT, () -> service.reorder(1L,new BacklogOrderRequest(List.of(1L,2L)),"owner"));
        service.reorder(1L,new BacklogOrderRequest(List.of()),"owner");
    }
}
