package com.example.collaborative_project_tracker.model;
import jakarta.persistence.*;
import lombok.*;
@Entity @Table(name="issue_dependencies",uniqueConstraints=@UniqueConstraint(columnNames={"blocker_id","blocked_id"}))
@Getter @Setter @NoArgsConstructor
public class IssueDependency {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="blocker_id",nullable=false) private Issue blocker;
    @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="blocked_id",nullable=false) private Issue blocked;
}
