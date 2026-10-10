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

class IssueHierarchyTests {
    IssueRepository issues; ProjectRepository projects; UserRepository users;
    IssueCommentRepository comments; IssueActivityRepository activities;
    ActivityService activity; MembershipService membership; IssueService service;
    Project project; AppUser owner, member; Issue epic, story, subtask;

    @BeforeEach void setup() {
        issues = mock(IssueRepository.class); projects = mock(ProjectRepository.class); users = mock(UserRepository.class);
        comments = mock(IssueCommentRepository.class); activities = mock(IssueActivityRepository.class);
        activity = mock(ActivityService.class); membership = mock(MembershipService.class);
        service = new IssueService(issues, projects, mock(ProjectMembershipRepository.class), users, membership,
                comments, activities, activity, mock(NotificationService.class));
        owner = new AppUser(); owner.setId(7L); owner.setEmail("owner");
        member = new AppUser(); member.setId(8L); member.setEmail("member");
        when(users.findByEmailIgnoreCase("owner")).thenReturn(Optional.of(owner));
        when(users.findByEmailIgnoreCase("member")).thenReturn(Optional.of(member));
        project = new Project(); project.setId(1L); project.setOwner(owner); project.setNextIssueNumber(4L);
        when(projects.findLockedById(1L)).thenReturn(Optional.of(project));
        epic = issue(1L, IssueType.EPIC); story = issue(2L, IssueType.STORY); subtask = issue(3L, IssueType.SUBTASK);
        story.setParent(epic); subtask.setParent(story); subtask.setAssignee(member);
        when(issues.save(any())).thenAnswer(call -> { Issue issue = call.getArgument(0); issue.setId(4L); return issue; });
    }
    Issue issue(long id, IssueType type) {
        Issue issue = new Issue(); issue.setId(id); issue.setProject(project); issue.setType(type); issue.setTitle("Issue " + id);
        when(issues.findById(id)).thenReturn(Optional.of(issue)); return issue;
    }
    IssueRequest request(IssueType type, Long parentId, Integer points) {
        return new IssueRequest("Child", null, null, null, null, type, points, List.of(), parentId);
    }
    void status(HttpStatus expected, Runnable operation) {
        assertEquals(expected, assertThrows(ResponseStatusException.class, operation::run).getStatusCode());
    }
    @Test void createsHierarchyAndReturnsStableParentKeys() {
        var created = service.create(1L, request(IssueType.SUBTASK, 2L, null), "owner");
        assertEquals(2L, created.parentId()); assertEquals("PRJ1-2", created.parentKey()); assertEquals(IssueType.SUBTASK, created.type());
        service.create(1L, request(IssueType.EPIC, null, null), "owner");
        service.create(1L, request(IssueType.BUG, 1L, 3), "owner");
    }
    @Test void rejectsMissingSelfForeignAndWrongLevelParentsWithoutAudit() {
        status(HttpStatus.BAD_REQUEST, () -> service.create(1L, request(IssueType.SUBTASK, null, null), "owner"));
        status(HttpStatus.BAD_REQUEST, () -> service.create(1L, request(IssueType.EPIC, 1L, null), "owner"));
        status(HttpStatus.BAD_REQUEST, () -> service.create(1L, request(IssueType.SUBTASK, 1L, null), "owner"));
        status(HttpStatus.BAD_REQUEST, () -> service.create(1L, request(IssueType.TASK, 2L, null), "owner"));
        status(HttpStatus.BAD_REQUEST, () -> service.create(1L, request(IssueType.SUBTASK, 3L, null), "owner"));
        status(HttpStatus.BAD_REQUEST, () -> service.update(1L, 2L, request(IssueType.STORY, 2L, null), "owner"));
        Project foreign = new Project(); foreign.setId(9L); epic.setProject(foreign);
        status(HttpStatus.NOT_FOUND, () -> service.create(1L, request(IssueType.STORY, 1L, null), "owner"));
        verifyNoInteractions(activity);
    }
    @Test void preventsSpecialTypeConversionAndDoubleEstimatedPoints() {
        status(HttpStatus.CONFLICT, () -> service.update(1L, 2L, request(IssueType.EPIC, null, null), "owner"));
        status(HttpStatus.CONFLICT, () -> service.update(1L, 3L, request(IssueType.TASK, null, null), "owner"));
        status(HttpStatus.BAD_REQUEST, () -> service.create(1L, request(IssueType.EPIC, null, 5), "owner"));
        status(HttpStatus.BAD_REQUEST, () -> service.create(1L, request(IssueType.SUBTASK, 2L, 3), "owner"));
    }
    @Test void allowsStandardTypeChangesAndAuditsReparenting() {
        service.update(1L, 2L, request(IssueType.BUG, null, 3), "owner");
        assertNull(story.getParent()); assertEquals(IssueType.BUG, story.getType());
        verify(activity).record(story, "owner", ActivityField.PARENT, "PRJ1-1", null);
        service.update(1L, 2L, request(IssueType.TASK, 1L, 5), "owner");
        assertSame(epic, story.getParent());
    }
    @Test void unfinishedChildrenBlockDoneAndCompletedAncestorsBlockReopeningOrNewWork() {
        when(issues.existsByParentIdAndStatusNot(2L, IssueStatus.DONE)).thenReturn(true);
        status(HttpStatus.CONFLICT, () -> service.updateStatus(1L, 2L, new UpdateIssueStatusRequest(IssueStatus.DONE), "owner"));
        epic.setStatus(IssueStatus.DONE);
        status(HttpStatus.CONFLICT, () -> service.create(1L, request(IssueType.SUBTASK, 2L, null), "owner"));
        subtask.setStatus(IssueStatus.DONE);
        status(HttpStatus.CONFLICT, () -> service.updateStatus(1L, 3L, new UpdateIssueStatusRequest(IssueStatus.TODO), "member"));
        assertEquals(IssueStatus.DONE, subtask.getStatus()); verifyNoInteractions(activity);
    }
    @Test void ownerAndSubtaskAssigneeCanChangeStatusButAssigneeCannotEditOrDelete() {
        assertEquals(IssueStatus.DONE, service.updateStatus(1L, 3L, new UpdateIssueStatusRequest(IssueStatus.DONE), "member").status());
        assertEquals(IssueStatus.TODO, service.updateStatus(1L, 3L, new UpdateIssueStatusRequest(IssueStatus.TODO), "owner").status());
        status(HttpStatus.FORBIDDEN, () -> service.update(1L, 3L, request(IssueType.SUBTASK, 2L, null), "member"));
        status(HttpStatus.FORBIDDEN, () -> service.delete(1L, 3L, "member"));
        status(HttpStatus.FORBIDDEN, () -> service.create(1L, request(IssueType.EPIC, null, null), "member"));
    }
    @Test void subtaskSprintFollowsParentAndReparenting() {
        Sprint sprint = new Sprint(); sprint.setId(20L); story.setSprint(sprint);
        when(issues.findByProjectIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(epic, story, subtask));
        assertEquals(20L, service.list(1L, "member").get(2).sprintId()); assertNull(subtask.getSprint());
        Issue other = issue(4L, IssueType.TASK);
        service.update(1L, 3L, request(IssueType.SUBTASK, 4L, null), "owner");
        assertSame(other, subtask.getParent()); assertNull(subtask.getEffectiveSprint());
    }
    @Test void deletingParentsNeverCascadesThroughChildren() {
        when(issues.findByParentId(1L)).thenReturn(List.of(story));
        when(issues.findByParentId(2L)).thenReturn(List.of(subtask));
        status(HttpStatus.CONFLICT, () -> service.delete(1L, 1L, "owner"));
        status(HttpStatus.CONFLICT, () -> service.delete(1L, 2L, "owner"));
        verifyNoInteractions(comments, activities);
        service.delete(1L, 3L, "owner");
        verify(comments).deleteAllByIssueId(3L); verify(issues).delete(subtask);
    }
}
