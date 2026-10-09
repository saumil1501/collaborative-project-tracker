package com.example.collaborative_project_tracker.service;

import com.example.collaborative_project_tracker.dto.*;
import com.example.collaborative_project_tracker.model.*;
import com.example.collaborative_project_tracker.repository.*;
import org.junit.jupiter.api.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.time.Instant;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CommentServiceTests {
    private IssueCommentRepository comments;
    private IssueRepository issues;
    private UserRepository users;
    private MembershipService memberships;
    private CommentService service;
    private Issue issue;
    private IssueComment comment;

    @BeforeEach
    void setup() {
        comments = mock(IssueCommentRepository.class);
        issues = mock(IssueRepository.class);
        users = mock(UserRepository.class);
        memberships = mock(MembershipService.class);
        service = new CommentService(comments, issues, users, memberships);
        Project project = new Project(); project.setId(1L);
        issue = new Issue(); issue.setId(2L); issue.setProject(project);
        AppUser author = new AppUser(); author.setId(7L); author.setEmail("author@example.test"); author.setName("Sam");
        comment = new IssueComment(); comment.setId(3L); comment.setIssue(issue); comment.setAuthor(author);
        comment.setBody("Original"); comment.setCreatedAt(Instant.parse("2026-10-09T10:00:00Z"));
        when(issues.findById(2L)).thenReturn(Optional.of(issue));
        when(comments.findByIdAndIssueId(3L, 2L)).thenReturn(Optional.of(comment));
        when(users.findByEmailIgnoreCase("author@example.test")).thenReturn(Optional.of(author));
    }

    @Test
    void membersCanReadTheOrderedDiscussion() {
        when(comments.findByIssueIdOrderByCreatedAtAscIdAsc(2L)).thenReturn(List.of(comment));
        var result = service.list(1L, 2L, "member@example.test");
        assertEquals("Original", result.getFirst().body());
        assertEquals(7L, result.getFirst().authorId());
        verify(memberships).requireMember(1L, "member@example.test");
    }

    @Test
    void rejectsNonMembersBeforeReadingComments() {
        doThrow(new ResponseStatusException(HttpStatus.NOT_FOUND)).when(memberships).requireMember(1L, "outsider@example.test");
        assertThrows(ResponseStatusException.class, () -> service.list(1L, 2L, "outsider@example.test"));
        verifyNoInteractions(comments, issues);
    }

    @Test
    void rejectsIssuesFromAnotherProject() {
        issue.getProject().setId(9L);
        assertEquals(HttpStatus.NOT_FOUND, assertThrows(ResponseStatusException.class,
                () -> service.create(1L, 2L, new CommentRequest("Hello"), "author@example.test")).getStatusCode());
        verifyNoInteractions(comments);
    }

    @Test
    void creationUsesTheAuthenticatedAuthorAndTrimsText() {
        when(comments.save(any())).thenAnswer(invocation -> {
            IssueComment saved = invocation.getArgument(0); saved.setId(4L); saved.setCreatedAt(Instant.now()); return saved;
        });
        var response = service.create(1L, 2L, new CommentRequest("  Hello\nteam  "), "author@example.test");
        assertEquals("Hello\nteam", response.body());
        assertEquals(7L, response.authorId());
        assertNull(response.editedAt());
    }

    @Test
    void authorCanEditAndReceivesAnEditedTimestamp() {
        var response = service.update(1L, 2L, 3L, new CommentRequest("Updated"), "AUTHOR@example.test");
        assertEquals("Updated", response.body());
        assertNotNull(response.editedAt());
        assertEquals(comment.getCreatedAt(), response.createdAt());
    }

    @Test
    void unchangedTextDoesNotMarkTheCommentEdited() {
        assertNull(service.update(1L, 2L, 3L, new CommentRequest(" Original "), "author@example.test").editedAt());
    }

    @Test
    void otherMembersIncludingProjectOwnersCannotEditOrDelete() {
        assertEquals(HttpStatus.FORBIDDEN, assertThrows(ResponseStatusException.class,
                () -> service.update(1L, 2L, 3L, new CommentRequest("Changed"), "owner@example.test")).getStatusCode());
        assertEquals(HttpStatus.FORBIDDEN, assertThrows(ResponseStatusException.class,
                () -> service.delete(1L, 2L, 3L, "owner@example.test")).getStatusCode());
        assertEquals("Original", comment.getBody());
        verify(comments, never()).delete(any(IssueComment.class));
    }

    @Test
    void rejectsACommentOutsideTheRequestedIssue() {
        when(comments.findByIdAndIssueId(3L, 2L)).thenReturn(Optional.empty());
        assertEquals(HttpStatus.NOT_FOUND, assertThrows(ResponseStatusException.class,
                () -> service.delete(1L, 2L, 3L, "author@example.test")).getStatusCode());
    }

    @Test
    void authorCanDeleteTheirComment() {
        service.delete(1L, 2L, 3L, "author@example.test");
        verify(comments).delete(comment);
    }

    @Test
    void issueDeletionRemovesCommentsFirst() {
        IssueService issueService = new IssueService(issues, mock(ProjectRepository.class),
                mock(ProjectMembershipRepository.class), users, memberships, comments);
        issueService.delete(1L, 2L, "member@example.test");
        var order = inOrder(comments, issues);
        order.verify(comments).deleteAllByIssueId(2L);
        order.verify(issues).delete(issue);
    }

    @Test
    void projectDeletionRemovesCommentsBeforeIssues() {
        ProjectRepository projects = mock(ProjectRepository.class);
        ProjectMembershipRepository projectMemberships = mock(ProjectMembershipRepository.class);
        Project project = issue.getProject(); project.setOwner(comment.getAuthor());
        when(projects.findById(1L)).thenReturn(Optional.of(project));
        new ProjectService(projects, users, projectMemberships, issues, comments).delete(1L, "author@example.test");
        var order = inOrder(comments, issues, projectMemberships, projects);
        order.verify(comments).deleteAllByProjectId(1L);
        order.verify(issues).deleteByProjectId(1L);
        order.verify(projectMemberships).deleteByProjectId(1L);
        order.verify(projects).delete(project);
    }
}
