package com.example.collaborative_project_tracker.repository;
import com.example.collaborative_project_tracker.model.*;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface IssueDependencyRepository extends JpaRepository<IssueDependency,Long> {
    List<IssueDependency> findByBlockedIdOrderByIdAsc(Long issueId);
    List<IssueDependency> findByBlockerIdOrderByIdAsc(Long issueId);
    List<IssueDependency> findByBlockerProjectId(Long projectId);
    boolean existsByBlockerIdAndBlockedId(Long blockerId,Long blockedId);
    void deleteByBlockerProjectId(Long projectId);
}
