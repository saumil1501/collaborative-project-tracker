package com.example.collaborative_project_tracker.controller;

import com.example.collaborative_project_tracker.dto.ActivityResponse;
import com.example.collaborative_project_tracker.service.ActivityService;
import org.springframework.web.bind.annotation.*;
import java.security.Principal;
import java.util.List;

@RestController
@RequestMapping("/api/projects/{projectId}/issues/{issueId}/activity")
public class ActivityController {
    private final ActivityService service;

    public ActivityController(ActivityService service) { this.service = service; }

    @GetMapping
    public List<ActivityResponse> list(@PathVariable Long projectId, @PathVariable Long issueId,
                                       Principal principal) {
        return service.list(projectId, issueId, principal.getName());
    }
}
