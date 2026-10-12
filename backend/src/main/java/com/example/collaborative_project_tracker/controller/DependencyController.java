package com.example.collaborative_project_tracker.controller;
import com.example.collaborative_project_tracker.dto.*;
import com.example.collaborative_project_tracker.service.DependencyService;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.security.Principal;
@RestController @RequestMapping("/api/projects/{projectId}/issues/{issueId}/dependencies")
public class DependencyController {
    private final DependencyService service;
    public DependencyController(DependencyService service) { this.service=service; }
    @PostMapping public ResponseEntity<DependencyItem> add(@PathVariable Long projectId,@PathVariable Long issueId,@Valid @RequestBody DependencyRequest request,Principal principal) { return ResponseEntity.status(HttpStatus.CREATED).body(service.add(projectId,issueId,request,principal.getName())); }
    @DeleteMapping("/{linkId}") public ResponseEntity<Void> remove(@PathVariable Long projectId,@PathVariable Long issueId,@PathVariable Long linkId,Principal principal) { service.remove(projectId,issueId,linkId,principal.getName()); return ResponseEntity.noContent().build(); }
    @ExceptionHandler(ResponseStatusException.class) public ResponseEntity<ProblemDetail> error(ResponseStatusException error) { return ResponseEntity.status(error.getStatusCode()).body(ProblemDetail.forStatusAndDetail(error.getStatusCode(),error.getReason()!=null?error.getReason():"Dependency operation unavailable")); }
}
