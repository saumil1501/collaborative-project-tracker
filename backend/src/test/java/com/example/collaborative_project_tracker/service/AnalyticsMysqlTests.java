package com.example.collaborative_project_tracker.service;

import com.example.collaborative_project_tracker.dto.*;
import com.example.collaborative_project_tracker.model.*;
import com.example.collaborative_project_tracker.repository.*;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDate;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest @Transactional @EnabledIfSystemProperty(named="liveMysqlTests",matches="true")
class AnalyticsMysqlTests {
    @Autowired UserRepository users; @Autowired IssueRepository issues;
    @Autowired ProjectService projects; @Autowired MembershipService membership;
    @Autowired IssueService issueService; @Autowired PlanningService planning;
    @Autowired DependencyService dependencies; @Autowired AnalyticsService analytics; @Autowired EntityManager entityManager;
    AppUser user() {
        AppUser user=new AppUser(); user.setName("Analytics tester"); user.setEmail("analytics-"+UUID.randomUUID()+"@example.invalid");
        user.setPassword("unused-test-hash"); return users.save(user);
    }
    IssueResponse create(Long projectId,String title,IssueType type,Integer points,Long parent,Long assignee,LocalDate due,String email) {
        return issueService.create(projectId,new IssueRequest(title,null,null,assignee,due,type,points,List.of(),parent),email);
    }
    SprintRequest sprint(String name) { return new SprintRequest(name,"Deliver a useful increment",LocalDate.now(),LocalDate.now().plusDays(7)); }
    @Test void projectAndLiveSprintMetricsRespectMembershipAndDoNotDoubleCountHierarchy() {
        AppUser owner=user(),member=user(),outsider=user();
        Long projectId=projects.create(new CreateProjectRequest("Analytics verification",null),owner.getEmail()).id();
        membership.addMember(projectId,new AddMemberRequest(member.getEmail()),owner.getEmail());
        var epic=create(projectId,"Authentication",IssueType.EPIC,null,null,owner.getId(),null,owner.getEmail());
        var story=create(projectId,"Login",IssueType.STORY,5,epic.id(),member.getId(),LocalDate.now().minusDays(1),owner.getEmail());
        create(projectId,"Login tests",IssueType.SUBTASK,null,story.id(),owner.getId(),LocalDate.now().minusDays(1),owner.getEmail());
        var bug=create(projectId,"API gateway",IssueType.BUG,3,null,null,LocalDate.now(),owner.getEmail());
        var docs=create(projectId,"Documentation",IssueType.TASK,2,null,owner.getId(),LocalDate.now().minusDays(1),owner.getEmail());
        issueService.updateStatus(projectId,docs.id(),new UpdateIssueStatusRequest(IssueStatus.DONE),owner.getEmail());
        var active=planning.create(projectId,sprint("Login sprint"),owner.getEmail());
        planning.move(projectId,story.id(),new MoveIssueSprintRequest(active.id()),owner.getEmail()); planning.start(projectId,active.id(),owner.getEmail());
        planning.create(projectId,sprint("Next sprint"),owner.getEmail());
        issueService.updateStatus(projectId,story.id(),new UpdateIssueStatusRequest(IssueStatus.IN_PROGRESS),member.getEmail());
        dependencies.add(projectId,story.id(),new DependencyRequest(bug.id(),"BLOCKED_BY"),owner.getEmail());
        entityManager.flush(); entityManager.clear();
        var data=analytics.get(projectId,member.getEmail());
        assertEquals(3,data.project().total()); assertEquals(1,data.project().todo()); assertEquals(1,data.project().inProgress()); assertEquals(1,data.project().done());
        assertEquals(10,data.project().totalPoints()); assertEquals(2,data.project().completedPoints());
        assertEquals(1,data.project().overdue()); assertEquals(1,data.project().blocked()); assertEquals(1,data.epicCount()); assertEquals(1,data.subtaskCount()); assertEquals(1,data.backlogIssues());
        assertEquals(1,data.attentionTotal()); assertEquals(List.of(bug.issueKey()),data.attention().getFirst().blockers());
        var report=data.sprints().stream().filter(item -> item.id().equals(active.id())).findFirst().orElseThrow();
        assertEquals(1,report.metrics().total()); assertEquals(5,report.metrics().totalPoints()); assertEquals(1,report.metrics().blocked()); assertEquals(0,report.netIssueChange());
        assertEquals(3,data.workload().size());
        assertEquals(1,data.workload().stream().filter(row -> Objects.equals(row.userId(),member.getId())).findFirst().orElseThrow().metrics().total());
        assertEquals(data.project(),analytics.get(projectId,owner.getEmail()).project());
        assertThrows(ResponseStatusException.class,()->analytics.get(projectId,outsider.getEmail()));
        projects.delete(projectId,owner.getEmail()); entityManager.flush(); entityManager.clear();
        assertThrows(ResponseStatusException.class,()->analytics.get(projectId,owner.getEmail()));
    }
    @Test void deliveryTrendsAndCompletedSprintMetricsSurviveLaterEditsAndIssueDeletion() {
        AppUser owner=user(); Long projectId=projects.create(new CreateProjectRequest("Historical analytics",null),owner.getEmail()).id();
        var first=create(projectId,"Shipped story",IssueType.STORY,5,null,owner.getId(),null,owner.getEmail());
        var second=create(projectId,"Carry-over task",IssueType.TASK,3,null,null,null,owner.getEmail());
        var sprint=planning.create(projectId,sprint("Iteration 1"),owner.getEmail());
        planning.move(projectId,first.id(),new MoveIssueSprintRequest(sprint.id()),owner.getEmail());
        planning.move(projectId,second.id(),new MoveIssueSprintRequest(sprint.id()),owner.getEmail()); planning.start(projectId,sprint.id(),owner.getEmail());
        issueService.updateStatus(projectId,first.id(),new UpdateIssueStatusRequest(IssueStatus.DONE),owner.getEmail());
        planning.complete(projectId,sprint.id(),owner.getEmail()); entityManager.flush(); entityManager.clear();
        var before=analytics.get(projectId,owner.getEmail()); var original=before.sprints().getFirst().metrics();
        assertEquals(2,original.total()); assertEquals(1,original.done()); assertEquals(5,original.completedPoints());
        assertNull(original.overdue()); assertNull(original.blocked());
        issueService.update(projectId,first.id(),new IssueRequest("Renamed",null,null,owner.getId(),null,IssueType.STORY,13,List.of()),owner.getEmail());
        issueService.delete(projectId,first.id(),owner.getEmail());
        issueService.update(projectId,second.id(),new IssueRequest("Reestimated",null,null,null,null,IssueType.TASK,8,List.of()),owner.getEmail());
        issueService.updateStatus(projectId,second.id(),new UpdateIssueStatusRequest(IssueStatus.DONE),owner.getEmail());
        entityManager.flush(); entityManager.clear();
        var after=analytics.get(projectId,owner.getEmail());
        assertEquals(original,after.sprints().getFirst().metrics()); assertEquals(8,after.project().completedPoints());
        assertEquals(5.0,after.trend().averageCompletedPoints()); assertEquals(List.of(sprint.id()),after.trend().recentSprintIds()); assertEquals(1,after.project().total());
    }
}
