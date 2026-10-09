package com.example.collaborative_project_tracker.repository;

import com.example.collaborative_project_tracker.model.IssueActivity;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.List;

public interface IssueActivityRepository extends JpaRepository<IssueActivity, Long> {
    @EntityGraph(attributePaths = "actor")
    List<IssueActivity> findByIssueIdOrderByCreatedAtDescIdDesc(Long issueId);

    @Modifying
    @Query("delete from IssueActivity a where a.issue.id = :issueId")
    void deleteAllByIssueId(@Param("issueId") Long issueId);

    @Modifying
    @Query("delete from IssueActivity a where a.issue.id in (select i.id from Issue i where i.project.id = :projectId)")
    void deleteAllByProjectId(@Param("projectId") Long projectId);
}
