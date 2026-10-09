package com.example.collaborative_project_tracker.repository;

import com.example.collaborative_project_tracker.model.Issue;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface IssueRepository extends JpaRepository<Issue, Long> {

    List<Issue> findByProjectIdOrderByCreatedAtDesc(Long projectId);
    List<Issue> findByProjectIdAndAssigneeId(Long projectId, Long assigneeId);

    void deleteByProjectId(Long projectId);
}
