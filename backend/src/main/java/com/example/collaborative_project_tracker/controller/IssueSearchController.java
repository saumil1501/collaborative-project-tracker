package com.example.collaborative_project_tracker.controller;
import com.example.collaborative_project_tracker.dto.*;
import com.example.collaborative_project_tracker.service.IssueSearchService;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.security.Principal;
import java.util.List;
@RestController @RequestMapping("/api/projects/{projectId}")
public class IssueSearchController {
    private final IssueSearchService service;
    public IssueSearchController(IssueSearchService service) { this.service=service; }
    @GetMapping("/issues/search") public IssueSearchResponse search(@PathVariable Long projectId,@ModelAttribute IssueSearchRequest request,Principal principal) { return service.search(projectId,request,principal.getName()); }
    @GetMapping("/saved-filters") public List<SavedFilterResponse> list(@PathVariable Long projectId,Principal principal) { return service.list(projectId,principal.getName()); }
    @PostMapping("/saved-filters") public ResponseEntity<SavedFilterResponse> create(@PathVariable Long projectId,@Valid @RequestBody SavedFilterRequest request,Principal principal) { return ResponseEntity.status(HttpStatus.CREATED).body(service.save(projectId,null,request,principal.getName())); }
    @PutMapping("/saved-filters/{id}") public SavedFilterResponse update(@PathVariable Long projectId,@PathVariable Long id,@Valid @RequestBody SavedFilterRequest request,Principal principal) { return service.save(projectId,id,request,principal.getName()); }
    @DeleteMapping("/saved-filters/{id}") public ResponseEntity<Void> delete(@PathVariable Long projectId,@PathVariable Long id,Principal principal) { service.delete(projectId,id,principal.getName()); return ResponseEntity.noContent().build(); }
    @ExceptionHandler(ResponseStatusException.class) public ResponseEntity<ProblemDetail> error(ResponseStatusException error) { return ResponseEntity.status(error.getStatusCode()).body(ProblemDetail.forStatusAndDetail(error.getStatusCode(),error.getReason()!=null?error.getReason():"Search operation unavailable")); }
}
