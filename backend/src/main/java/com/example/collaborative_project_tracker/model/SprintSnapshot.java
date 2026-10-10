package com.example.collaborative_project_tracker.model;
import jakarta.persistence.*;
import lombok.*;

@Embeddable @Getter @Setter @NoArgsConstructor
public class SprintSnapshot {
    private Long issueId;
    @Column(length = 64) private String issueKey;
    @Column(length = 150) private String title;
    @Enumerated(EnumType.STRING) private IssueStatus status;
    private Integer storyPoints;
    @Column(length = 255) private String assigneeName;
    public SprintSnapshot(Issue issue) {
        issueId = issue.getId(); issueKey = issue.getIssueKey(); title = issue.getTitle();
        status = issue.getStatus(); storyPoints = issue.getStoryPoints();
        assigneeName = issue.getAssignee() != null ? issue.getAssignee().getName() : null;
    }
}
