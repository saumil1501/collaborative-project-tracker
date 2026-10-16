package com.example.collaborative_project_tracker.service;

import com.example.collaborative_project_tracker.controller.AnalyticsController;
import com.example.collaborative_project_tracker.dto.AnalyticsResponse;
import com.example.collaborative_project_tracker.model.*;
import com.example.collaborative_project_tracker.repository.*;
import org.junit.jupiter.api.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AnalyticsServiceTests {
    IssueRepository issues; SprintRepository sprints; IssueDependencyRepository links;
    ProjectMembershipRepository members; MembershipService membership; AnalyticsService service;
    LocalDate today=LocalDate.of(2026,10,16); Instant now=Instant.parse("2026-10-16T12:00:00Z");
    Project project;
    @BeforeEach void setup() {
        issues=mock(IssueRepository.class); sprints=mock(SprintRepository.class); links=mock(IssueDependencyRepository.class);
        members=mock(ProjectMembershipRepository.class); membership=mock(MembershipService.class);
        service=new AnalyticsService(issues,sprints,links,members,membership);
        project=new Project(); project.setId(1L);
    }
    Issue issue(long id,IssueType type,IssueStatus status,Integer points) {
        Issue issue=new Issue(); issue.setId(id); issue.setProject(project); issue.setTitle("Issue "+id);
        issue.setType(type); issue.setStatus(status); issue.setStoryPoints(points); return issue;
    }
    ProjectMembership member(long id) {
        AppUser user=new AppUser(); user.setId(id); user.setName("Alex");
        ProjectMembership member=new ProjectMembership(); member.setProject(project); member.setUser(user); return member;
    }
    Sprint sprint(long id,SprintStatus status) {
        Sprint sprint=new Sprint(); sprint.setId(id); sprint.setName("Iteration "+id); sprint.setProject(project); sprint.setStatus(status); return sprint;
    }
    IssueDependency link(Issue blocker,Issue blocked) { IssueDependency link=new IssueDependency(); link.setBlocker(blocker); link.setBlocked(blocked); return link; }
    AnalyticsResponse calculate(List<Issue> issues,List<Sprint> sprints,List<IssueDependency> links,List<ProjectMembership> members) { return service.calculate(issues,sprints,links,members,today,now); }
    @Test void emptyProjectHasZeroCountsWithoutFabricatedDeliveryHistory() {
        var data=calculate(List.of(),List.of(),List.of(),List.of());
        assertEquals(0,data.project().total()); assertEquals(0,data.project().blocked()); assertEquals(0,data.backlogIssues());
        assertEquals(0,data.trend().sampleSize()); assertNull(data.trend().averageCompletedPoints()); assertNull(data.trend().averageCompletedIssues());
        assertEquals(1,data.workload().size()); assertNull(data.workload().getFirst().userId()); assertTrue(data.attention().isEmpty());
    }
    @Test void countsStandardWorkOnceAndHandlesOverdueBlockersLabelsAndDuplicateNames() {
        var alex=member(7); var otherAlex=member(8);
        Issue epic=issue(1,IssueType.EPIC,IssueStatus.TODO,null), story=issue(2,IssueType.STORY,IssueStatus.IN_PROGRESS,5);
        Issue subtask=issue(3,IssueType.SUBTASK,IssueStatus.TODO,null), task=issue(4,null,IssueStatus.TODO,null);
        Issue bug=issue(5,IssueType.BUG,IssueStatus.DONE,3), blocked=issue(6,IssueType.TASK,IssueStatus.TODO,2);
        story.setParent(epic); subtask.setParent(story); story.setDueDate(today.minusDays(1)); subtask.setDueDate(today.minusDays(1));
        task.setDueDate(today); bug.setDueDate(today.minusDays(5)); blocked.setDueDate(today.minusDays(2));
        story.setAssignee(alex.getUser()); bug.setAssignee(alex.getUser());
        Sprint active=sprint(10,SprintStatus.ACTIVE); active.setCommittedIssueCount(1); active.setCommittedPoints(5); story.setSprint(active);
        var data=calculate(List.of(epic,story,subtask,task,bug,blocked),List.of(active),
                List.of(link(epic,story),link(task,story),link(bug,task),link(story,blocked),link(epic,bug)),List.of(alex,otherAlex));
        var metrics=data.project(); assertEquals(4,metrics.total()); assertEquals(2,metrics.todo()); assertEquals(1,metrics.inProgress()); assertEquals(1,metrics.done());
        assertEquals(10,metrics.totalPoints()); assertEquals(3,metrics.completedPoints()); assertEquals(3,metrics.estimatedIssues());
        assertEquals(2,metrics.overdue()); assertEquals(2,metrics.blocked()); assertEquals(1,data.epicCount()); assertEquals(1,data.subtaskCount()); assertEquals(2,data.backlogIssues());
        assertEquals(2,data.types().stream().filter(type -> type.type()==IssueType.TASK).findFirst().orElseThrow().total());
        assertEquals(List.of(6L,2L),data.attention().stream().map(row -> row.issueId()).toList());
        assertEquals(2,data.attention().getLast().blockers().size()); // Two prerequisites still count as one blocked issue.
        assertEquals(3,data.workload().size());
        assertEquals(2,data.workload().stream().filter(row -> Objects.equals(row.userId(),7L)).findFirst().orElseThrow().metrics().total());
        assertEquals(0,data.workload().stream().filter(row -> Objects.equals(row.userId(),8L)).findFirst().orElseThrow().metrics().total());
        assertEquals(2,data.workload().stream().filter(row -> row.userId()==null).findFirst().orElseThrow().metrics().total());
    }
    @Test void completedReportsUseImmutableSnapshotsNotLiveIssues() {
        Sprint completed=sprint(10,SprintStatus.COMPLETED); completed.setCompletedAt(now); completed.setCommittedIssueCount(5); completed.setCommittedPoints(13);
        Issue original=issue(1,IssueType.STORY,IssueStatus.DONE,5), unfinished=issue(2,IssueType.TASK,IssueStatus.IN_PROGRESS,3);
        completed.getSnapshots().add(new SprintSnapshot(original)); completed.getSnapshots().add(new SprintSnapshot(unfinished));
        original.setStatus(IssueStatus.TODO); original.setStoryPoints(13);
        var data=calculate(List.of(original),List.of(completed),List.of(),List.of());
        var report=data.sprints().getFirst(); assertEquals(1,report.metrics().done()); assertEquals(5,report.metrics().completedPoints());
        assertEquals(8,report.metrics().totalPoints()); assertEquals(-3,report.netIssueChange()); assertEquals(-5,report.netPointChange());
        assertNull(report.metrics().overdue()); assertNull(report.metrics().blocked());
        assertEquals(0,data.project().done()); assertEquals(report.metrics(),calculate(List.of(),List.of(completed),List.of(),List.of()).sprints().getFirst().metrics());
    }
    @Test void trendUsesFiveMostRecentlyCompletedSprintsRatherThanLargestIds() {
        int[] estimates={1,2,3,5,8,13}; List<Sprint> history=new ArrayList<>();
        for(int i=0;i<6;i++) {
            Sprint sprint=sprint(106-i,SprintStatus.COMPLETED); sprint.setCompletedAt(now.plusSeconds(i));
            sprint.getSnapshots().add(new SprintSnapshot(issue(i+1,IssueType.TASK,IssueStatus.DONE,estimates[i]))); history.add(sprint);
        }
        history.add(sprint(999,SprintStatus.ACTIVE));
        var trend=calculate(List.of(),history,List.of(),List.of()).trend();
        assertEquals(6,trend.completedSprints()); assertEquals(5,trend.sampleSize()); assertEquals(List.of(101L,102L,103L,104L,105L),trend.recentSprintIds());
        assertEquals(6.2,trend.averageCompletedPoints(),0.001); assertEquals(1.0,trend.averageCompletedIssues());
    }
    @Test void plannedAndActiveReportsUseLiveScopeAndPreserveMissingCommitments() {
        Sprint planned=sprint(1,SprintStatus.PLANNED),active=sprint(2,SprintStatus.ACTIVE);
        active.setCommittedIssueCount(3); active.setCommittedPoints(8);
        Issue task=issue(1,IssueType.TASK,IssueStatus.TODO,null); task.setSprint(planned);
        var reports=calculate(List.of(task),List.of(planned,active),List.of(),List.of()).sprints();
        assertEquals(1,reports.getFirst().metrics().total()); assertNull(reports.getFirst().netIssueChange());
        assertEquals(0,reports.getLast().metrics().total()); assertEquals(-3,reports.getLast().netIssueChange());
    }
    @Test void attentionListIsBoundedWithoutLosingTotalCounts() {
        List<Issue> work=new ArrayList<>();
        for(int id=25;id>0;id--) { Issue task=issue(id,IssueType.TASK,IssueStatus.TODO,null); task.setDueDate(today.minusDays(1)); work.add(task); }
        var data=calculate(work,List.of(),List.of(),List.of());
        assertEquals(25,data.attentionTotal()); assertEquals(20,data.attention().size());
        assertEquals(1L,data.attention().getFirst().issueId()); assertEquals(20L,data.attention().getLast().issueId()); assertEquals(25,data.project().overdue());
    }
    @Test void outsidersCannotReadAnyProjectDataAndMembersUseReadOnlyRepositories() {
        doThrow(new ResponseStatusException(HttpStatus.NOT_FOUND)).when(membership).requireMember(1L,"outsider");
        assertThrows(ResponseStatusException.class,()->service.get(1L,"outsider")); verifyNoInteractions(issues,sprints,links,members);
        service.get(1L,"member");
        verify(issues).findByProjectIdOrderByCreatedAtDesc(1L); verify(sprints).findByProjectIdOrderByIdDesc(1L);
        verify(links).findByBlockerProjectId(1L); verify(members).findByProjectId(1L);
        verifyNoMoreInteractions(issues,sprints,links,members); verify(membership,never()).requireOwner(anyLong(),anyString());
    }
    @Test void httpEndpointBindsProjectAndPrincipalAndDisablesCaching() throws Exception {
        var mocked=mock(AnalyticsService.class); when(mocked.get(1L,"member")).thenReturn(calculate(List.of(),List.of(),List.of(),List.of()));
        var mvc=MockMvcBuilders.standaloneSetup(new AnalyticsController(mocked)).build();
        mvc.perform(get("/api/projects/1/analytics").principal(()->"member")).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"));
        verify(mocked).get(1L,"member");
    }
}
