package com.example.collaborative_project_tracker.controller;
import com.example.collaborative_project_tracker.dto.AnalyticsResponse;
import com.example.collaborative_project_tracker.service.AnalyticsService;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.security.Principal;
@RestController @RequestMapping("/api/projects/{projectId}/analytics")
public class AnalyticsController {
    private final AnalyticsService service;
    public AnalyticsController(AnalyticsService service) { this.service=service; }
    @GetMapping public ResponseEntity<AnalyticsResponse> get(@PathVariable Long projectId,Principal principal) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.get(projectId,principal.getName()));
    }
}
