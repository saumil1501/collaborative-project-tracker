package com.example.collaborative_project_tracker.service;

import com.example.collaborative_project_tracker.dto.*;
import com.example.collaborative_project_tracker.model.*;
import com.example.collaborative_project_tracker.repository.*;
import org.junit.jupiter.api.*;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ProjectKeyTests {
    ProjectRepository projects;
    ProjectService service;
    AppUser owner;
    @BeforeEach void setup() {
        projects = mock(ProjectRepository.class); var users = mock(UserRepository.class);
        owner = new AppUser(); owner.setId(7L); owner.setEmail("owner@example.test");
        when(users.findByEmailIgnoreCase(owner.getEmail())).thenReturn(Optional.of(owner));
        when(projects.saveAndFlush(any())).thenAnswer(call -> { Project project = call.getArgument(0); project.setId(42L); return project; });
        service = new ProjectService(projects, users, mock(ProjectMembershipRepository.class), mock(IssueRepository.class),
            mock(IssueCommentRepository.class), mock(IssueActivityRepository.class), mock(ProjectLeaveRequestRepository.class));
    }
    @Test void acceptsPermanentCustomKeyAndAutomaticFallback() {
        assertEquals("WEB", service.create(new CreateProjectRequest("Project", null, "WEB"), owner.getEmail()).projectKey());
        assertEquals("PRJ42", service.create(new CreateProjectRequest("Project", null), owner.getEmail()).projectKey());
    }
    @Test void duplicateKeysReturnConflictIncludingConcurrentInsert() {
        when(projects.existsByProjectKey("WEB")).thenReturn(true);
        assertEquals(HttpStatus.CONFLICT, assertThrows(ResponseStatusException.class,
            () -> service.create(new CreateProjectRequest("Project", null, "WEB"), owner.getEmail())).getStatusCode());
        when(projects.existsByProjectKey("WEB")).thenReturn(false);
        doThrow(new DataIntegrityViolationException("Duplicate key")).when(projects).saveAndFlush(any());
        assertEquals(HttpStatus.CONFLICT, assertThrows(ResponseStatusException.class,
            () -> service.create(new CreateProjectRequest("Project", null, "WEB"), owner.getEmail())).getStatusCode());
    }
    @Test void invalidKeysCannotCollideWithGeneratedNamespace() {
        for (String key : java.util.List.of("web", "PRJ42", "A", "TOOLONGPROJECTKEY", "BAD-KEY"))
            assertEquals(HttpStatus.BAD_REQUEST, assertThrows(ResponseStatusException.class,
                () -> service.create(new CreateProjectRequest("Project", null, key), owner.getEmail())).getStatusCode());
        verify(projects, never()).saveAndFlush(any());
    }
}
