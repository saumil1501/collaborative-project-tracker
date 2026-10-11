package com.example.collaborative_project_tracker.service;
import com.example.collaborative_project_tracker.dto.*;
import com.example.collaborative_project_tracker.model.*;
import com.example.collaborative_project_tracker.repository.*;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
@SpringBootTest @Transactional @EnabledIfSystemProperty(named="liveMysqlTests",matches="true")
class IssueSearchMysqlTests {
    @Autowired UserRepository users; @Autowired ProjectRepository projects; @Autowired IssueRepository issues;
    @Autowired SavedIssueFilterRepository filters; @Autowired ProjectService projectService;
    @Autowired IssueService issueService; @Autowired MembershipService membership;
    @Autowired IssueSearchService search; @Autowired PlanningService planning; @Autowired EntityManager entityManager;
    AppUser owner,member,outsider; Long projectId; IssueResponse epic,story,subtask,task,done;
    AppUser user() { AppUser user=new AppUser(); user.setName("Search tester"); user.setEmail("search-"+UUID.randomUUID()+"@example.invalid"); user.setPassword("unused-test-hash"); return users.save(user); }
    @BeforeEach void setup() {
        owner=user(); member=user(); outsider=user();
        projectId=projectService.create(new CreateProjectRequest("Search verification",null),owner.getEmail()).id();
        membership.addMember(projectId,new AddMemberRequest(member.getEmail()),owner.getEmail());
        epic=create("Authentication",IssueType.EPIC,null,null,null,null,List.of());
        story=create("Login 100% secure",IssueType.STORY,epic.id(),member.getId(),IssuePriority.HIGH,LocalDate.now().minusDays(1),List.of("frontend"));
        subtask=create("Login tests",IssueType.SUBTASK,story.id(),owner.getId(),IssuePriority.HIGH,LocalDate.now().minusDays(1),List.of("backend"));
        task=create("Login 100X secure",IssueType.TASK,null,null,IssuePriority.LOW,LocalDate.now(),List.of("frontend-tools"));
        done=create("Shipped login",IssueType.TASK,null,null,IssuePriority.MEDIUM,LocalDate.now().minusDays(2),List.of("frontend"));
        issueService.updateStatus(projectId,done.id(),new UpdateIssueStatusRequest(IssueStatus.DONE),owner.getEmail());
        var foreign=projectService.create(new CreateProjectRequest("Other project",null),outsider.getEmail());
        issueService.create(foreign.id(),new IssueRequest("Login foreign",null,null,null,null,IssueType.TASK,null,List.of("frontend")),outsider.getEmail());
        entityManager.flush(); entityManager.clear();
    }
    IssueResponse create(String title,IssueType type,Long parent,Long assignee,IssuePriority priority,LocalDate due,List<String> labels) {
        return issueService.create(projectId,new IssueRequest(title,null,priority,assignee,due,type,type==IssueType.STORY?5:null,labels,parent),owner.getEmail());
    }
    IssueSearchRequest c(String q,String status,String type,String priority,String assignee,Long epic,String sprint,String label,boolean overdue,String sort,int page,int size) {
        return new IssueSearchRequest(q,status,type,priority,assignee,epic,sprint,label,overdue,null,null,sort,page,size);
    }
    List<Long> ids(IssueSearchRequest c) { return search.search(projectId,c,member.getEmail()).items().stream().map(IssueResponse::id).toList(); }
    @Test void combinesFiltersEscapesWildcardsAndMatchesReadableKeys() {
        assertEquals(List.of(story.id()),ids(c("login","TODO","STORY","HIGH","me",epic.id(),null,"FRONTEND",true,"key_asc",0,20)));
        assertEquals(List.of(story.id()),ids(c("100%",null,null,null,null,null,null,null,false,"key_asc",0,20)));
        assertEquals(List.of(story.id()),ids(c(story.issueKey().toLowerCase(),null,null,null,null,null,null,null,false,"key_asc",0,20)));
        assertEquals(List.of(story.id(),done.id()),ids(c(null,null,null,null,null,null,null,"frontend",false,"key_asc",0,20)));
        assertEquals(List.of(story.id(),subtask.id()),ids(c(null,null,null,null,null,epic.id(),null,null,false,"key_asc",0,20)));
        assertEquals(List.of(story.id(),subtask.id()),ids(c(null,null,null,null,null,null,null,null,true,"key_asc",0,20)));
        var dates=new IssueSearchRequest(null,null,null,null,null,null,null,null,false,LocalDate.now(),LocalDate.now(),"key_asc",0,20);
        assertEquals(List.of(task.id()),ids(dates));
    }
    @Test void paginatesStablyAndFollowsParentSprintAndLegacyMetadata() {
        Issue legacy=new Issue(); legacy.setProject(projects.findById(projectId).orElseThrow()); legacy.setTitle("Legacy"); legacy.setType(null); issues.saveAndFlush(legacy);
        var page=search.search(projectId,c(null,null,null,null,null,null,null,null,false,"key_asc",0,2),member.getEmail());
        assertEquals(6,page.totalElements()); assertEquals(3,page.totalPages()); assertEquals(List.of(epic.id(),story.id()),page.items().stream().map(IssueResponse::id).toList());
        assertEquals(List.of(subtask.id(),task.id()),ids(c(null,null,null,null,null,null,null,null,false,"key_asc",1,2)));
        assertTrue(ids(c(null,null,"TASK",null,null,null,null,null,false,"key_asc",0,20)).contains(legacy.getId()));
        var sprint=planning.create(projectId,new SprintRequest("Login sprint",null,LocalDate.now(),LocalDate.now().plusDays(7)),owner.getEmail());
        planning.move(projectId,story.id(),new MoveIssueSprintRequest(sprint.id()),owner.getEmail()); entityManager.flush(); entityManager.clear();
        assertEquals(List.of(story.id(),subtask.id()),ids(c(null,null,null,null,null,null,String.valueOf(sprint.id()),null,false,"key_asc",0,20)));
        assertEquals(List.of(task.id(),legacy.getId()),ids(c(null,null,null,null,null,null,"backlog",null,false,"key_asc",0,20)));
        assertEquals(List.of(story.id(),subtask.id(),epic.id(),done.id(),legacy.getId(),task.id()),ids(c(null,null,null,null,null,null,null,null,false,"priority_desc",0,20)));
        assertEquals(List.of(done.id(),story.id(),subtask.id(),task.id(),epic.id(),legacy.getId()),ids(c(null,null,null,null,null,null,null,null,false,"due_asc",0,20)));
    }
    @Test void personalFiltersPersistStayPrivateAndAreDeletedWithProject() {
        var criteria=c(null,null,null,null,"me",null,null,null,true,"due_asc",2,50);
        var saved=search.save(projectId,null,new SavedFilterRequest("My overdue issues",criteria),member.getEmail()); entityManager.flush(); entityManager.clear();
        assertEquals("me",search.list(projectId,member.getEmail()).getFirst().criteria().assignee());
        assertTrue(search.list(projectId,owner.getEmail()).isEmpty());
        assertThrows(org.springframework.web.server.ResponseStatusException.class,()->search.delete(projectId,saved.id(),owner.getEmail()));
        assertThrows(org.springframework.web.server.ResponseStatusException.class,()->search.search(projectId,criteria,outsider.getEmail()));
        search.save(projectId,saved.id(),new SavedFilterRequest("Renamed",criteria),member.getEmail()); entityManager.flush(); entityManager.clear();
        assertEquals("Renamed",search.list(projectId,member.getEmail()).getFirst().name());
        projectService.delete(projectId,owner.getEmail()); entityManager.flush(); entityManager.clear();
        assertFalse(filters.existsById(saved.id()));
    }
}
