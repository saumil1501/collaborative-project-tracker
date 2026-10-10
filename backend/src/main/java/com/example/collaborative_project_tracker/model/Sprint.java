package com.example.collaborative_project_tracker.model;
import jakarta.persistence.*;
import lombok.*;
import java.time.*;
import java.util.*;

@Entity @Table(name = "sprints") @Getter @Setter @NoArgsConstructor
public class Sprint {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "project_id", nullable = false) private Project project;
    @Column(nullable = false, length = 150) private String name;
    @Column(length = 1000) private String goal;
    @Column(nullable = false) private LocalDate startDate;
    @Column(nullable = false) private LocalDate endDate;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private SprintStatus status = SprintStatus.PLANNED;
    private Instant startedAt;
    private Instant completedAt;
    private Integer committedIssueCount;
    private Integer committedPoints;
    @ElementCollection @CollectionTable(name = "sprint_snapshots", joinColumns = @JoinColumn(name = "sprint_id"))
    @OrderColumn(name = "snapshot_order") private List<SprintSnapshot> snapshots = new ArrayList<>();
}
