package com.example.collaborative_project_tracker.service;

import com.example.collaborative_project_tracker.dto.*;
import com.example.collaborative_project_tracker.model.*;
import com.example.collaborative_project_tracker.repository.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.time.Instant;
import java.util.List;

@Service
public class CommentService {
    private final IssueCommentRepository comments;
    private final IssueRepository issues;
    private final UserRepository users;
    private final MembershipService memberships;
    private final NotificationService notifications;

    public CommentService(IssueCommentRepository comments, IssueRepository issues,
                          UserRepository users, MembershipService memberships, NotificationService notifications) {
        this.comments = comments;
        this.issues = issues;
        this.users = users;
        this.memberships = memberships;
        this.notifications = notifications;
    }

    @Transactional(readOnly = true)
    public List<CommentResponse> list(Long projectId, Long issueId, String email) {
        requireIssue(projectId, issueId, email);
        return comments.findByIssueIdOrderByCreatedAtAscIdAsc(issueId).stream()
                .map(this::toResponse).toList();
    }

    @Transactional
    public CommentResponse create(Long projectId, Long issueId, CommentRequest request, String email) {
        Issue issue = requireIssue(projectId, issueId, email);
        AppUser author = users.findByEmailIgnoreCase(email)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        IssueComment comment = new IssueComment();
        comment.setIssue(issue);
        comment.setAuthor(author);
        comment.setBody(request.body().trim());
        IssueComment saved = comments.save(comment);
        notifications.commented(issue, author);
        return toResponse(saved);
    }

    @Transactional
    public CommentResponse update(Long projectId, Long issueId, Long commentId,
                                  CommentRequest request, String email) {
        requireIssue(projectId, issueId, email);
        IssueComment comment = requireAuthor(issueId, commentId, email);
        String body = request.body().trim();
        if (!body.equals(comment.getBody())) {
            comment.setBody(body);
            comment.setEditedAt(Instant.now());
        }
        return toResponse(comment);
    }

    @Transactional
    public void delete(Long projectId, Long issueId, Long commentId, String email) {
        requireIssue(projectId, issueId, email);
        comments.delete(requireAuthor(issueId, commentId, email));
    }

    private Issue requireIssue(Long projectId, Long issueId, String email) {
        memberships.requireMember(projectId, email);
        Issue issue = issues.findById(issueId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!issue.getProject().getId().equals(projectId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        return issue;
    }

    private IssueComment requireAuthor(Long issueId, Long commentId, String email) {
        IssueComment comment = comments.findByIdAndIssueId(commentId, issueId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!comment.getAuthor().getEmail().equalsIgnoreCase(email)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the author can change this comment");
        }
        return comment;
    }

    private CommentResponse toResponse(IssueComment comment) {
        return new CommentResponse(comment.getId(), comment.getAuthor().getId(),
                comment.getAuthor().getName(), comment.getBody(), comment.getCreatedAt(), comment.getEditedAt());
    }
}
