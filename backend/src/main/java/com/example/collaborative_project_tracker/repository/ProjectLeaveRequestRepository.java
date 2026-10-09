package com.example.collaborative_project_tracker.repository;

import com.example.collaborative_project_tracker.model.ProjectLeaveRequest;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.*;

public interface ProjectLeaveRequestRepository extends JpaRepository<ProjectLeaveRequest, Long> {
    Optional<ProjectLeaveRequest> findByProjectIdAndUserId(Long projectId, Long userId);
    Optional<ProjectLeaveRequest> findByIdAndProjectId(Long id, Long projectId);
    @EntityGraph(attributePaths = "user")
    List<ProjectLeaveRequest> findByProjectIdOrderByRequestedAtDesc(Long projectId);
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from ProjectLeaveRequest r where r.project.id = :projectId")
    void deleteAllByProjectId(@Param("projectId") Long projectId);
}
