package com.example.collaborative_project_tracker.repository;

import com.example.collaborative_project_tracker.model.Issue;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface IssueRepository extends JpaRepository<Issue, Long> {
    @org.springframework.data.jpa.repository.Query("select coalesce(max(coalesce(i.issueNumber, i.id)), 0) from Issue i where i.project.id = :projectId")
    Long highestIssueNumber(@org.springframework.data.repository.query.Param("projectId") Long projectId);


    List<Issue> findByProjectIdOrderByCreatedAtDesc(Long projectId);
    List<Issue> findByProjectIdAndAssigneeId(Long projectId, Long assigneeId);

    void deleteByProjectId(Long projectId);
}
