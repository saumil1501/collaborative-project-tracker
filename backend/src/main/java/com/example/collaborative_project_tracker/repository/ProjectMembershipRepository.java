package com.example.collaborative_project_tracker.repository;

import com.example.collaborative_project_tracker.model.*;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface ProjectMembershipRepository
        extends JpaRepository<ProjectMembership, Long> {

    boolean existsByProjectIdAndUserId(Long projectId, Long userId);

    Optional<ProjectMembership> findByProjectIdAndUserId(
            Long projectId, Long userId);

    List<ProjectMembership> findByProjectId(Long projectId);

    List<ProjectMembership> findByUserId(Long userId);

    void deleteByProjectId(Long projectId);
}