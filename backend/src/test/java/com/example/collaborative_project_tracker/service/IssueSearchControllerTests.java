package com.example.collaborative_project_tracker.service;
import com.example.collaborative_project_tracker.controller.IssueSearchController;
import com.example.collaborative_project_tracker.dto.*;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.time.LocalDate;
import java.util.List;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
class IssueSearchControllerTests {
    @Test void bindsSearchDatesPaginationAndPrincipalThroughHttp() throws Exception {
        var service=mock(IssueSearchService.class);
        when(service.search(eq(1L),any(),eq("member"))).thenReturn(new IssueSearchResponse(List.of(),0,0,0,20));
        var mvc=MockMvcBuilders.standaloneSetup(new IssueSearchController(service)).build();
        mvc.perform(get("/api/projects/1/issues/search").principal(()->"member")
                .param("dueFrom","2026-10-01").param("dueTo","2026-10-31").param("epicId","2").param("overdue","true").param("size","50").param("assignee","me"))
                .andExpect(status().isOk());
        var criteria=ArgumentCaptor.forClass(IssueSearchRequest.class); verify(service).search(eq(1L),criteria.capture(),eq("member"));
        assertEquals(LocalDate.of(2026,10,1),criteria.getValue().dueFrom()); assertEquals(2L,criteria.getValue().epicId());
        assertTrue(criteria.getValue().overdue()); assertEquals(50,criteria.getValue().size()); assertNull(criteria.getValue().page());
        mvc.perform(get("/api/projects/1/issues/search").principal(()->"member").param("dueFrom","").param("dueTo","").param("epicId","")).andExpect(status().isOk());
        mvc.perform(get("/api/projects/1/issues/search").principal(()->"member").param("size","invalid")).andExpect(status().isBadRequest());
    }
}
