package com.example.collaborative_project_tracker.repository;
import com.example.collaborative_project_tracker.model.*;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface SprintRepository extends JpaRepository<Sprint, Long> {
    List<Sprint> findByProjectIdOrderByIdDesc(Long projectId);
    boolean existsByProjectIdAndStatus(Long projectId, SprintStatus status);
    void deleteByProjectId(Long projectId);
}
