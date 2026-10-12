package com.example.collaborative_project_tracker.service;
import com.example.collaborative_project_tracker.dto.*;
import com.example.collaborative_project_tracker.model.*;
import com.example.collaborative_project_tracker.repository.*;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
@SpringBootTest @Transactional @EnabledIfSystemProperty(named="liveMysqlTests",matches="true")
class DependencyMysqlTests {
    @Autowired UserRepository users; @Autowired IssueRepository issues; @Autowired ProjectRepository projects;
    @Autowired IssueDependencyRepository links; @Autowired IssueActivityRepository activities;
    @Autowired ProjectService projectService; @Autowired IssueService issueService;
    @Autowired MembershipService membership; @Autowired DependencyService dependencies; @Autowired EntityManager entityManager;
    AppUser owner,member; Long projectId; IssueResponse first,second,third;
    AppUser user() { AppUser user=new AppUser(); user.setName("Dependency tester"); user.setEmail("dependency-"+UUID.randomUUID()+"@example.invalid"); user.setPassword("unused-test-hash"); return users.save(user); }
    @BeforeEach void setup() {
        owner=user(); member=user(); projectId=projectService.create(new CreateProjectRequest("Dependency verification",null),owner.getEmail()).id();
        membership.addMember(projectId,new AddMemberRequest(member.getEmail()),owner.getEmail());
        first=create("Build API",IssueType.TASK,null,owner.getId()); second=create("Build UI",IssueType.TASK,null,member.getId()); third=create("Deploy",IssueType.TASK,null,owner.getId());
    }
    IssueResponse create(String title,IssueType type,Long parent,Long assignee) { return issueService.create(projectId,new IssueRequest(title,null,null,assignee,null,type,null,List.of(),parent),owner.getEmail()); }
    void status(HttpStatus expected,Runnable action) { assertEquals(expected,assertThrows(ResponseStatusException.class,action::run).getStatusCode()); }
    @Test void persistedBlockersGateOwnerAndAssigneeStatusUntilCompletedOrRemoved() {
        var link=dependencies.add(projectId,second.id(),new DependencyRequest(first.id(),"BLOCKED_BY"),owner.getEmail());
        entityManager.flush(); entityManager.clear();
        var saved=issueService.list(projectId,member.getEmail()).stream().filter(issue -> issue.id().equals(second.id())).findFirst().orElseThrow();
        assertEquals(first.issueKey(),saved.blockedBy().getFirst().issueKey()); assertEquals(IssueStatus.TODO,saved.blockedBy().getFirst().status());
        for(String actor:List.of(owner.getEmail(),member.getEmail())) status(HttpStatus.CONFLICT,()->issueService.updateStatus(projectId,second.id(),new UpdateIssueStatusRequest(IssueStatus.IN_PROGRESS),actor));
        entityManager.flush(); entityManager.clear();
        assertEquals(IssueStatus.TODO,issues.findById(second.id()).orElseThrow().getStatus());
        assertTrue(activities.findByIssueIdOrderByCreatedAtDescIdDesc(second.id()).stream().noneMatch(activity -> activity.getField()==ActivityField.STATUS));
        issueService.updateStatus(projectId,first.id(),new UpdateIssueStatusRequest(IssueStatus.DONE),owner.getEmail());
        var updated=issueService.updateStatus(projectId,second.id(),new UpdateIssueStatusRequest(IssueStatus.IN_PROGRESS),member.getEmail());
        assertEquals(IssueStatus.DONE,updated.blockedBy().getFirst().status());
        issueService.updateStatus(projectId,first.id(),new UpdateIssueStatusRequest(IssueStatus.TODO),owner.getEmail());
        status(HttpStatus.CONFLICT,()->issueService.updateStatus(projectId,second.id(),new UpdateIssueStatusRequest(IssueStatus.TODO),member.getEmail()));
        dependencies.remove(projectId,second.id(),link.id(),owner.getEmail());
        assertEquals(IssueStatus.DONE,issueService.updateStatus(projectId,second.id(),new UpdateIssueStatusRequest(IssueStatus.DONE),member.getEmail()).status());
        entityManager.flush(); entityManager.clear(); assertFalse(links.existsById(link.id()));
        assertEquals(2,activities.findByIssueIdOrderByCreatedAtDescIdDesc(second.id()).stream().filter(activity -> activity.getField()==ActivityField.DEPENDENCY).count());
    }
    @Test void rejectsCyclesIncludingHierarchyChangesAndCrossProjectLinks() {
        dependencies.add(projectId,first.id(),new DependencyRequest(second.id(),"BLOCKS"),owner.getEmail());
        dependencies.add(projectId,second.id(),new DependencyRequest(third.id(),"BLOCKS"),owner.getEmail());
        status(HttpStatus.CONFLICT,()->dependencies.add(projectId,third.id(),new DependencyRequest(first.id(),"BLOCKS"),owner.getEmail()));
        status(HttpStatus.CONFLICT,()->dependencies.add(projectId,first.id(),new DependencyRequest(second.id(),"BLOCKS"),owner.getEmail()));
        status(HttpStatus.BAD_REQUEST,()->dependencies.add(projectId,first.id(),new DependencyRequest(first.id(),"BLOCKS"),owner.getEmail()));
        var epic=create("Launch",IssueType.EPIC,null,owner.getId());
        dependencies.add(projectId,first.id(),new DependencyRequest(epic.id(),"BLOCKED_BY"),owner.getEmail());
        status(HttpStatus.CONFLICT,()->issueService.update(projectId,first.id(),new IssueRequest("Build API",null,null,owner.getId(),null,IssueType.TASK,null,List.of(),epic.id()),owner.getEmail()));
        var child=create("API tests",IssueType.SUBTASK,first.id(),owner.getId());
        status(HttpStatus.CONFLICT,()->dependencies.add(projectId,first.id(),new DependencyRequest(child.id(),"BLOCKS"),owner.getEmail()));
        var foreign=projectService.create(new CreateProjectRequest("Other dependency project",null),owner.getEmail());
        var foreignIssue=issueService.create(foreign.id(),new IssueRequest("Foreign",null,null,null,null),owner.getEmail());
        status(HttpStatus.NOT_FOUND,()->dependencies.add(projectId,first.id(),new DependencyRequest(foreignIssue.id(),"BLOCKS"),owner.getEmail()));
        entityManager.flush(); entityManager.clear(); assertNull(issues.findById(first.id()).orElseThrow().getParent());
        assertEquals(3,links.findByBlockerProjectId(projectId).size());
        projectService.delete(projectId,owner.getEmail()); entityManager.flush(); entityManager.clear();
        assertTrue(links.findByBlockerProjectId(projectId).isEmpty()); assertFalse(projects.existsById(projectId));
    }
    @Test void ownerOnlyLinkChangesAndIssueDeletionPreserveSurvivorActivity() {
        status(HttpStatus.FORBIDDEN,()->dependencies.add(projectId,first.id(),new DependencyRequest(second.id(),"BLOCKS"),member.getEmail()));
        var incoming=dependencies.add(projectId,first.id(),new DependencyRequest(third.id(),"BLOCKED_BY"),owner.getEmail());
        var outgoing=dependencies.add(projectId,first.id(),new DependencyRequest(second.id(),"BLOCKS"),owner.getEmail());
        status(HttpStatus.FORBIDDEN,()->dependencies.remove(projectId,first.id(),incoming.id(),member.getEmail()));
        status(HttpStatus.NOT_FOUND,()->dependencies.remove(projectId,third.id(),outgoing.id(),owner.getEmail()));
        issueService.delete(projectId,first.id(),owner.getEmail()); entityManager.flush(); entityManager.clear();
        assertFalse(links.existsById(incoming.id())); assertFalse(links.existsById(outgoing.id()));
        assertTrue(issueService.list(projectId,member.getEmail()).stream().filter(issue -> issue.id().equals(second.id())).findFirst().orElseThrow().blockedBy().isEmpty());
        assertTrue(activities.findByIssueIdOrderByCreatedAtDescIdDesc(second.id()).stream().anyMatch(activity -> activity.getField()==ActivityField.DEPENDENCY && activity.getNewValue()==null));
        issueService.updateStatus(projectId,second.id(),new UpdateIssueStatusRequest(IssueStatus.IN_PROGRESS),member.getEmail());
    }
}
