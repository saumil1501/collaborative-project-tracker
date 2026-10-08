package com.example.collaborative_project_tracker.model;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(
    name = "project_memberships",
    uniqueConstraints = @UniqueConstraint(
        columnNames = {"project_id", "user_id"}
    )
)
@Getter
@Setter
@NoArgsConstructor
public class ProjectMembership {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private AppUser user;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ProjectRole role;
}