package com.example.collaborative_project_tracker.model;
import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDate;
import com.example.collaborative_project_tracker.dto.IssueSearchRequest;
@Entity @Table(name="saved_issue_filters", indexes=@Index(columnList="project_id,user_id"))
@Getter @Setter @NoArgsConstructor
public class SavedIssueFilter {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch=FetchType.LAZY, optional=false) @JoinColumn(name="project_id",nullable=false) private Project project;
    @ManyToOne(fetch=FetchType.LAZY, optional=false) @JoinColumn(name="user_id",nullable=false) private AppUser user;
    @Column(nullable=false,length=80) private String name;
    @Column(length=150) private String q;
    private String status, type, priority, assignee, sprint;
    private Long epicId;
    @Column(length=30) private String label;
    private Boolean overdue;
    private LocalDate dueFrom, dueTo;
    @Column(name="sort_order") private String sort;
    public void apply(IssueSearchRequest query) {
        q=query.q(); status=query.status(); type=query.type(); priority=query.priority(); assignee=query.assignee();
        epicId=query.epicId(); sprint=query.sprint(); label=query.label(); overdue=query.overdue();
        dueFrom=query.dueFrom(); dueTo=query.dueTo(); sort=query.sort();
    }
    public IssueSearchRequest criteria() { return new IssueSearchRequest(q,status,type,priority,assignee,epicId,sprint,label,overdue,dueFrom,dueTo,sort,0,20); }
}
