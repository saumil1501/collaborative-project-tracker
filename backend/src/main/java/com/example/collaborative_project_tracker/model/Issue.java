package com.example.collaborative_project_tracker.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "issues", uniqueConstraints = @UniqueConstraint(columnNames = {"project_id", "issue_number"}))
@Getter
@Setter
@NoArgsConstructor
public class Issue {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 150)
    private String title;

    @Column(length = 2000)
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private IssueStatus status = IssueStatus.TODO;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private IssuePriority priority = IssuePriority.MEDIUM;

    private LocalDate dueDate;

    @Column(name = "issue_number")
    private Long issueNumber;

    @Enumerated(EnumType.STRING)
    private IssueType type = IssueType.TASK;

    private Integer storyPoints;

    @Column(length = 500)
    private String labels;

    public IssueType getType() { return type != null ? type : IssueType.TASK; }
    public String getIssueKey() { return project.getDisplayKey() + "-" + (issueNumber != null ? issueNumber : id); }

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assignee_id")
    private AppUser assignee;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
    }
}