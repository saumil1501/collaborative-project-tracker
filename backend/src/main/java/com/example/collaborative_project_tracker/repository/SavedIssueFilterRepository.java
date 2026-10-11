package com.example.collaborative_project_tracker.repository;
import com.example.collaborative_project_tracker.model.SavedIssueFilter;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface SavedIssueFilterRepository extends JpaRepository<SavedIssueFilter,Long> {
    List<SavedIssueFilter> findByProjectIdAndUserIdOrderByNameAscIdAsc(Long projectId,Long userId);
    Optional<SavedIssueFilter> findByIdAndProjectIdAndUserId(Long id,Long projectId,Long userId);
    long countByProjectIdAndUserId(Long projectId,Long userId);
    void deleteByProjectId(Long projectId);
}
