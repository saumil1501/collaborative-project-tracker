package com.example.collaborative_project_tracker.repository;

import com.example.collaborative_project_tracker.model.IssueComment;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;

public interface IssueCommentRepository extends JpaRepository<IssueComment, Long> {
    @EntityGraph(attributePaths = "author")
    List<IssueComment> findByIssueIdOrderByCreatedAtAscIdAsc(Long issueId);

    Optional<IssueComment> findByIdAndIssueId(Long id, Long issueId);

    @Modifying
    @Query("delete from IssueComment c where c.issue.id = :issueId")
    void deleteAllByIssueId(@Param("issueId") Long issueId);

    @Modifying
    @Query("delete from IssueComment c where c.issue.id in (select i.id from Issue i where i.project.id = :projectId)")
    void deleteAllByProjectId(@Param("projectId") Long projectId);
}
