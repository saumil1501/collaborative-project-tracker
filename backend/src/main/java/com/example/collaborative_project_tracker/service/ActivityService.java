package com.example.collaborative_project_tracker.service;

import com.example.collaborative_project_tracker.dto.ActivityResponse;
import com.example.collaborative_project_tracker.model.*;
import com.example.collaborative_project_tracker.repository.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;
import java.util.Objects;

@Service
public class ActivityService {
    private final IssueActivityRepository activities;
    private final IssueRepository issues;
    private final UserRepository users;
    private final MembershipService memberships;

    public ActivityService(IssueActivityRepository activities, IssueRepository issues,
                           UserRepository users, MembershipService memberships) {
        this.activities = activities;
        this.issues = issues;
        this.users = users;
        this.memberships = memberships;
    }

    @Transactional(readOnly = true)
    public List<ActivityResponse> list(Long projectId, Long issueId, String email) {
        memberships.requireMember(projectId, email);
        Issue issue = issues.findById(issueId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!issue.getProject().getId().equals(projectId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        return activities.findByIssueIdOrderByCreatedAtDescIdDesc(issueId).stream()
                .map(activity -> new ActivityResponse(activity.getId(), activity.getActor().getId(),
                        activity.getActor().getName(), activity.getField(), activity.getOldValue(),
                        activity.getNewValue(), activity.getCreatedAt())).toList();
    }

    // Joins the issue mutation transaction, so failed writes leave no activity behind.
    @Transactional
    public void record(Issue issue, String email, ActivityField field, String oldValue, String newValue) {
        if (field != ActivityField.CREATED && Objects.equals(oldValue, newValue)) return;
        AppUser actor = users.findByEmailIgnoreCase(email)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        IssueActivity activity = new IssueActivity();
        activity.setIssue(issue);
        activity.setActor(actor);
        activity.setField(field);
        activity.setOldValue(oldValue);
        activity.setNewValue(newValue);
        activities.save(activity);
    }
}
