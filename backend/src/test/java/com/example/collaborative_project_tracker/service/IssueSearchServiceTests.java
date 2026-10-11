package com.example.collaborative_project_tracker.service;
import com.example.collaborative_project_tracker.dto.*;
import com.example.collaborative_project_tracker.model.*;
import com.example.collaborative_project_tracker.repository.*;
import org.junit.jupiter.api.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDate;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class IssueSearchServiceTests {
    IssueSearchService service; IssueRepository issues; ProjectRepository projects;
    SavedIssueFilterRepository filters; MembershipService membership; AppUser actor;
    @BeforeEach void setup() {
        issues=mock(IssueRepository.class); projects=mock(ProjectRepository.class); filters=mock(SavedIssueFilterRepository.class);
        membership=mock(MembershipService.class); UserRepository users=mock(UserRepository.class);
        actor=new AppUser(); actor.setId(7L); Project project=new Project(); project.setId(1L);
        when(users.findByEmailIgnoreCase("member")).thenReturn(Optional.of(actor));
        when(projects.findLockedById(1L)).thenReturn(Optional.of(project));
        when(filters.save(any())).thenAnswer(call -> { SavedIssueFilter filter=call.getArgument(0); filter.setId(10L); return filter; });
        service=new IssueSearchService(issues,projects,users,filters,membership,mock(IssueService.class));
    }
    IssueSearchRequest query(String status,String assignee,String sort,Integer page,Integer size) { return new IssueSearchRequest(" title ",status,null,null,assignee,null,null,"FrontEnd",true,null,null,sort,page,size); }
    void bad(Runnable action) { assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ResponseStatusException.class,action::run).getStatusCode()); }
    @Test void normalizesDefaultsAndValidatesBoundedCriteria() {
        var result=service.normalize(query(null,"me",null,null,null));
        assertEquals("title",result.q()); assertEquals("frontend",result.label()); assertEquals(20,result.size()); assertEquals(0,result.page()); assertEquals("created_desc",result.sort());
        bad(() -> service.normalize(query("ANY",null,null,0,20)));
        bad(() -> service.normalize(query(null,"-1",null,0,20)));
        bad(() -> service.normalize(query(null,"not-an-id",null,0,20)));
        bad(() -> service.normalize(query(null,null,"title; drop table",0,20)));
        bad(() -> service.normalize(query(null,null,null,-1,20)));
        bad(() -> service.normalize(query(null,null,null,0,101)));
        bad(() -> service.normalize(query(null,null,null,0,0)));
        bad(() -> service.normalize(new IssueSearchRequest(null,null,null,null,null,null,null,null,false,LocalDate.now(),LocalDate.now().minusDays(1),null,null,null)));
    }
    @Test void searchAndSavedFilterReadsCheckMembershipBeforeAccessingData() {
        doThrow(new ResponseStatusException(HttpStatus.NOT_FOUND)).when(membership).requireMember(1L,"outsider");
        assertThrows(ResponseStatusException.class,() -> service.search(1L,query(null,null,null,0,20),"outsider"));
        assertThrows(ResponseStatusException.class,() -> service.list(1L,"outsider"));
        verifyNoInteractions(issues,filters,projects);
    }
    @Test void ordinaryMembersCanCreatePersonalFiltersUnderProjectLock() {
        var filter=service.save(1L,null,new SavedFilterRequest(" My overdue issues ",query(null,"me",null,5,50)),"member");
        assertEquals("My overdue issues",filter.name()); assertEquals("me",filter.criteria().assignee());
        assertEquals(0,filter.criteria().page()); assertEquals(20,filter.criteria().size());
        var order=inOrder(projects,membership,filters); order.verify(projects).findLockedById(1L); order.verify(membership).requireMember(1L,"member");
        verify(membership,never()).requireOwner(anyLong(),anyString());
    }
    @Test void updateAndDeleteCannotAccessAnotherUsersOrProjectsFilter() {
        assertEquals(HttpStatus.NOT_FOUND,assertThrows(ResponseStatusException.class,() -> service.save(1L,99L,new SavedFilterRequest("Private",query(null,null,null,0,20)),"member")).getStatusCode());
        assertEquals(HttpStatus.NOT_FOUND,assertThrows(ResponseStatusException.class,() -> service.delete(1L,99L,"member")).getStatusCode());
        verify(filters,times(2)).findByIdAndProjectIdAndUserId(99L,1L,7L);
        verify(filters,never()).delete(any(SavedIssueFilter.class)); verify(filters,never()).save(any());
    }
    @Test void ownsFilterUpdatesDeletesAndLimitsSavedNames() {
        SavedIssueFilter existing=new SavedIssueFilter(); existing.setId(10L);
        when(filters.findByIdAndProjectIdAndUserId(10L,1L,7L)).thenReturn(Optional.of(existing));
        var result=service.save(1L,10L,new SavedFilterRequest("Updated",query("TODO","me","due_asc",0,20)),"member");
        assertEquals("TODO",result.criteria().status()); assertEquals("Updated",result.name());
        service.delete(1L,10L,"member"); verify(filters).delete(existing);
        bad(() -> service.save(1L,null,new SavedFilterRequest(" ",query(null,null,null,0,20)),"member"));
        when(filters.countByProjectIdAndUserId(1L,7L)).thenReturn(20L);
        assertEquals(HttpStatus.CONFLICT,assertThrows(ResponseStatusException.class,() -> service.save(1L,null,new SavedFilterRequest("New",query(null,null,null,0,20)),"member")).getStatusCode());
    }
}
