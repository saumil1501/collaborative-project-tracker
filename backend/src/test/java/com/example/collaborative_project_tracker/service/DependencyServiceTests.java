package com.example.collaborative_project_tracker.service;
import com.example.collaborative_project_tracker.dto.*;
import com.example.collaborative_project_tracker.model.*;
import com.example.collaborative_project_tracker.repository.*;
import org.junit.jupiter.api.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class DependencyServiceTests {
    IssueDependencyRepository links; IssueRepository issues; ProjectRepository projects;
    MembershipService membership; ActivityService activity; NotificationService notifications;
    DependencyService service; IssueService issueService; Project project; AppUser owner,member;
    Issue first,second,third;
    @BeforeEach void setup() {
        links=mock(IssueDependencyRepository.class); issues=mock(IssueRepository.class); projects=mock(ProjectRepository.class);
        membership=mock(MembershipService.class); activity=mock(ActivityService.class); notifications=mock(NotificationService.class);
        UserRepository users=mock(UserRepository.class);
        owner=new AppUser(); owner.setId(7L); member=new AppUser(); member.setId(8L);
        when(users.findByEmailIgnoreCase("owner")).thenReturn(Optional.of(owner)); when(users.findByEmailIgnoreCase("member")).thenReturn(Optional.of(member));
        project=new Project(); project.setId(1L); project.setOwner(owner); when(projects.findLockedById(1L)).thenReturn(Optional.of(project));
        first=issue(1L); second=issue(2L); third=issue(3L); second.setAssignee(member);
        when(issues.findByProjectIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(first,second,third));
        when(links.save(any())).thenAnswer(call -> { IssueDependency link=call.getArgument(0); link.setId(10L); return link; });
        service=new DependencyService(links,issues,projects,membership,activity);
        issueService=new IssueService(issues,projects,mock(ProjectMembershipRepository.class),users,membership,
                mock(IssueCommentRepository.class),mock(IssueActivityRepository.class),activity,notifications,service);
    }
    Issue issue(long id) { Issue issue=new Issue(); issue.setId(id); issue.setTitle("Issue "+id); issue.setProject(project); when(issues.findById(id)).thenReturn(Optional.of(issue)); return issue; }
    IssueDependency link(Issue from,Issue to) { IssueDependency link=new IssueDependency(); link.setId(10L); link.setBlocker(from); link.setBlocked(to); return link; }
    void status(HttpStatus expected,Runnable action) { assertEquals(expected,assertThrows(ResponseStatusException.class,action::run).getStatusCode()); }
    @Test void ownerCreatesDirectionallyCorrectLinksAndBothActivityEntries() {
        var result=service.add(1L,2L,new DependencyRequest(1L,"BLOCKED_BY"),"owner"); assertEquals(1L,result.issueId());
        verify(activity).record(second,"owner",ActivityField.DEPENDENCY,null,"Blocked by PRJ1-1");
        verify(activity).record(first,"owner",ActivityField.DEPENDENCY,null,"Blocks PRJ1-2");
        var order=inOrder(projects,membership,links); order.verify(projects).findLockedById(1L); order.verify(membership).requireOwner(1L,"owner");
        service.add(1L,1L,new DependencyRequest(3L,"BLOCKS"),"owner");
        verify(activity).record(third,"owner",ActivityField.DEPENDENCY,null,"Blocked by PRJ1-1");
    }
    @Test void membersCannotManageLinksAndForeignOrUnrelatedTargetsAreHidden() {
        doThrow(new ResponseStatusException(HttpStatus.FORBIDDEN)).when(membership).requireOwner(1L,"member");
        status(HttpStatus.FORBIDDEN,()->service.add(1L,2L,new DependencyRequest(1L,"BLOCKED_BY"),"member"));
        status(HttpStatus.FORBIDDEN,()->service.remove(1L,2L,10L,"member"));
        Project foreign=new Project(); foreign.setId(9L); third.setProject(foreign);
        status(HttpStatus.NOT_FOUND,()->service.add(1L,1L,new DependencyRequest(3L,"BLOCKS"),"owner"));
        verify(links,never()).save(any()); verify(links,never()).delete(any(IssueDependency.class)); verifyNoInteractions(activity);
    }
    @Test void selfDuplicateAndDependencyCyclesAreRejectedWithoutWrites() {
        status(HttpStatus.BAD_REQUEST,()->service.add(1L,1L,new DependencyRequest(1L,"BLOCKS"),"owner"));
        when(links.existsByBlockerIdAndBlockedId(1L,2L)).thenReturn(true);
        status(HttpStatus.CONFLICT,()->service.add(1L,1L,new DependencyRequest(2L,"BLOCKS"),"owner"));
        when(links.findByBlockerProjectId(1L)).thenReturn(List.of(link(first,second),link(second,third)));
        status(HttpStatus.CONFLICT,()->service.add(1L,3L,new DependencyRequest(1L,"BLOCKS"),"owner"));
        verify(links,never()).save(any()); verifyNoInteractions(activity);
    }
    @Test void hierarchyCompletionCyclesAreRejectedOnLinksAndReparenting() {
        second.setType(IssueType.SUBTASK); second.setParent(first);
        status(HttpStatus.CONFLICT,()->service.add(1L,1L,new DependencyRequest(2L,"BLOCKS"),"owner"));
        service.add(1L,2L,new DependencyRequest(1L,"BLOCKS"),"owner"); // A duplicate prerequisite edge is harmless.
        clearInvocations(activity); second.setParent(null); second.setType(IssueType.TASK);
        third.setType(IssueType.EPIC); first.setType(IssueType.STORY);
        when(links.findByBlockerProjectId(1L)).thenReturn(List.of(link(third,first)));
        status(HttpStatus.CONFLICT,()->issueService.update(1L,1L,new IssueRequest("Story",null,null,null,null,IssueType.STORY,null,List.of(),3L),"owner"));
        assertNull(first.getParent()); verifyNoInteractions(activity);
    }
    @Test void unfinishedBlockersPreventEveryActualStatusChangeForOwnerAndAssignee() {
        when(links.findByBlockedIdOrderByIdAsc(2L)).thenReturn(List.of(link(first,second)));
        for(IssueStatus source:IssueStatus.values()) for(IssueStatus target:IssueStatus.values()) if(source!=target) {
            second.setStatus(source);
            for(String actor:List.of("owner","member")) status(HttpStatus.CONFLICT,()->issueService.updateStatus(1L,2L,new UpdateIssueStatusRequest(target),actor));
            assertEquals(source,second.getStatus());
        }
        verifyNoInteractions(activity,notifications);
    }
    @Test void sameStatusIsHarmlessAndDoneBlockersUnlockStatusChanges() {
        when(links.findByBlockedIdOrderByIdAsc(2L)).thenReturn(List.of(link(first,second)));
        issueService.updateStatus(1L,2L,new UpdateIssueStatusRequest(IssueStatus.TODO),"owner"); verifyNoInteractions(activity,notifications);
        first.setStatus(IssueStatus.DONE);
        assertEquals(IssueStatus.IN_PROGRESS,issueService.updateStatus(1L,2L,new UpdateIssueStatusRequest(IssueStatus.IN_PROGRESS),"member").status());
    }
    @Test void removingLinksRequiresConnectedIssueAndAuditsBothEnds() {
        var link=link(first,second); when(links.findById(10L)).thenReturn(Optional.of(link));
        status(HttpStatus.NOT_FOUND,()->service.remove(1L,3L,10L,"owner")); verify(links,never()).delete(any(IssueDependency.class));
        service.remove(1L,2L,10L,"owner"); verify(links).delete(link);
        verify(activity).record(second,"owner",ActivityField.DEPENDENCY,"Blocked by PRJ1-1",null);
        verify(activity).record(first,"owner",ActivityField.DEPENDENCY,"Blocks PRJ1-2",null);
    }
    @Test void completedWorkCannotAcquireAnUnfinishedBlocker() {
        second.setStatus(IssueStatus.DONE);
        status(HttpStatus.CONFLICT,()->service.add(1L,2L,new DependencyRequest(1L,"BLOCKED_BY"),"owner"));
        first.setStatus(IssueStatus.DONE); service.add(1L,2L,new DependencyRequest(1L,"BLOCKED_BY"),"owner");
    }
    @Test void issueDeletionRemovesBothDirectionsBeforeDeletingIssueAndKeepsSurvivorHistory() {
        var outgoing=link(first,second); var incoming=link(third,first);
        when(links.findByBlockedIdOrderByIdAsc(1L)).thenReturn(List.of(incoming)); when(links.findByBlockerIdOrderByIdAsc(1L)).thenReturn(List.of(outgoing));
        issueService.delete(1L,1L,"owner");
        verify(links).deleteAll(List.of(incoming,outgoing));
        var order=inOrder(links,issues); order.verify(links).flush(); order.verify(issues).delete(first);
        verify(activity).record(second,"owner",ActivityField.DEPENDENCY,"Blocked by PRJ1-1",null);
        verify(activity).record(third,"owner",ActivityField.DEPENDENCY,"Blocks PRJ1-1",null);
    }
}
