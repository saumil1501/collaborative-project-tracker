package com.example.collaborative_project_tracker.controller;
import com.example.collaborative_project_tracker.dto.*;
import com.example.collaborative_project_tracker.service.PlanningService;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import java.security.Principal;
import java.util.List;
@RestController @RequestMapping("/api/projects/{projectId}")
public class PlanningController {
    private final PlanningService service;
    public PlanningController(PlanningService service) { this.service = service; }
    @GetMapping("/sprints") public List<SprintResponse> list(@PathVariable Long projectId, Principal user) { return service.list(projectId, user.getName()); }
    @PostMapping("/sprints") public ResponseEntity<SprintResponse> create(@PathVariable Long projectId, @Valid @RequestBody SprintRequest request, Principal user) { return ResponseEntity.status(HttpStatus.CREATED).body(service.create(projectId, request, user.getName())); }
    @PutMapping("/sprints/{sprintId}") public SprintResponse update(@PathVariable Long projectId, @PathVariable Long sprintId, @Valid @RequestBody SprintRequest request, Principal user) { return service.update(projectId, sprintId, request, user.getName()); }
    @PatchMapping("/sprints/{sprintId}/start") public SprintResponse start(@PathVariable Long projectId, @PathVariable Long sprintId, Principal user) { return service.start(projectId, sprintId, user.getName()); }
    @PatchMapping("/sprints/{sprintId}/complete") public SprintResponse complete(@PathVariable Long projectId, @PathVariable Long sprintId, Principal user) { return service.complete(projectId, sprintId, user.getName()); }
    @DeleteMapping("/sprints/{sprintId}") @ResponseStatus(HttpStatus.NO_CONTENT) public void delete(@PathVariable Long projectId, @PathVariable Long sprintId, Principal user) { service.delete(projectId, sprintId, user.getName()); }
    @PatchMapping("/issues/{issueId}/sprint") @ResponseStatus(HttpStatus.NO_CONTENT) public void move(@PathVariable Long projectId, @PathVariable Long issueId, @Valid @RequestBody MoveIssueSprintRequest request, Principal user) { service.move(projectId, issueId, request, user.getName()); }
    @PutMapping("/backlog/order") @ResponseStatus(HttpStatus.NO_CONTENT) public void reorder(@PathVariable Long projectId, @Valid @RequestBody BacklogOrderRequest request, Principal user) { service.reorder(projectId, request, user.getName()); }
}
