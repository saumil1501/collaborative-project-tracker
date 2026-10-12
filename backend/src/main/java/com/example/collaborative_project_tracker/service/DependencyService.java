package com.example.collaborative_project_tracker.service;

import com.example.collaborative_project_tracker.dto.*;
import com.example.collaborative_project_tracker.model.*;
import com.example.collaborative_project_tracker.repository.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;

@Service
public class DependencyService {
    private final IssueDependencyRepository links;
    private final IssueRepository issues;
    private final ProjectRepository projects;
    private final MembershipService membership;
    private final ActivityService activity;
    public DependencyService(IssueDependencyRepository links, IssueRepository issues, ProjectRepository projects,
                             MembershipService membership, ActivityService activity) {
        this.links=links; this.issues=issues; this.projects=projects; this.membership=membership; this.activity=activity;
    }
    @Transactional
    public DependencyItem add(Long projectId,Long issueId,DependencyRequest request,String email) {
        ownerLock(projectId,email);
        if(request.targetId()==null || request.targetId()<1 || !List.of("BLOCKS","BLOCKED_BY").contains(Objects.toString(request.direction(),"")))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Choose a target issue and a dependency direction");
        Issue issue=getIssue(projectId,issueId),target=getIssue(projectId,request.targetId());
        if(issueId.equals(target.getId())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"An issue cannot depend on itself");
        Issue blocker=request.direction().equals("BLOCKS")?issue:target;
        Issue blocked=request.direction().equals("BLOCKS")?target:issue;
        if(links.existsByBlockerIdAndBlockedId(blocker.getId(),blocked.getId())) throw conflict("This dependency already exists");
        validateGraph(projectId,null,null,blocker.getId(),blocked.getId());
        if(blocked.getStatus()==IssueStatus.DONE && blocker.getStatus()!=IssueStatus.DONE)
            throw conflict("Reopen the completed issue before adding an unfinished blocker");
        IssueDependency link=new IssueDependency(); link.setBlocker(blocker); link.setBlocked(blocked);
        link=links.save(link); record(link,email,true,null);
        return item(link,target);
    }
    @Transactional
    public void remove(Long projectId,Long issueId,Long linkId,String email) {
        ownerLock(projectId,email); getIssue(projectId,issueId);
        IssueDependency link=links.findById(linkId).filter(value -> value.getBlocker().getProject().getId().equals(projectId)
            && value.getBlocked().getProject().getId().equals(projectId)
            && (value.getBlocker().getId().equals(issueId) || value.getBlocked().getId().equals(issueId))).orElseThrow(this::missing);
        record(link,email,false,null); links.delete(link);
    }
    // Called under the issue service's project lock, before status/history changes.
    public void requireUnblocked(Issue issue) {
        List<String> blockers=links.findByBlockedIdOrderByIdAsc(issue.getId()).stream()
            .map(IssueDependency::getBlocker).filter(blocker -> blocker.getStatus()!=IssueStatus.DONE).map(Issue::getIssueKey).toList();
        if(!blockers.isEmpty()) throw conflict("Status changes are blocked until these issues are done: "+String.join(", ",blockers));
    }
    public List<DependencyItem> blockedBy(Issue issue) {
        return links.findByBlockedIdOrderByIdAsc(issue.getId()).stream().map(link -> item(link,link.getBlocker())).toList();
    }
    public List<DependencyItem> blocks(Issue issue) {
        return links.findByBlockerIdOrderByIdAsc(issue.getId()).stream().map(link -> item(link,link.getBlocked())).toList();
    }
    public void validateParent(Issue issue,Issue parent) {
        validateGraph(issue.getProject().getId(),issue.getId(),parent!=null?parent.getId():null,null,null);
    }
    public void removeForDeletedIssue(Issue issue,String email) {
        List<IssueDependency> affected=new ArrayList<>(links.findByBlockedIdOrderByIdAsc(issue.getId()));
        affected.addAll(links.findByBlockerIdOrderByIdAsc(issue.getId()));
        affected.forEach(link -> record(link,email,false,issue.getId()));
        links.deleteAll(affected); links.flush();
    }
    private void ownerLock(Long projectId,String email) { projects.findLockedById(projectId).orElseThrow(this::missing); membership.requireOwner(projectId,email); }
    private Issue getIssue(Long projectId,Long id) { return issues.findById(id).filter(issue -> issue.getProject().getId().equals(projectId)).orElseThrow(this::missing); }
    private DependencyItem item(IssueDependency link,Issue issue) { return new DependencyItem(link.getId(),issue.getId(),issue.getIssueKey(),issue.getTitle(),issue.getStatus()); }
    private void record(IssueDependency link,String email,boolean added,Long deletingId) {
        if(!Objects.equals(link.getBlocked().getId(),deletingId)) activity.record(link.getBlocked(),email,ActivityField.DEPENDENCY,
                added?null:"Blocked by "+link.getBlocker().getIssueKey(),added?"Blocked by "+link.getBlocker().getIssueKey():null);
        if(!Objects.equals(link.getBlocker().getId(),deletingId)) activity.record(link.getBlocker(),email,ActivityField.DEPENDENCY,
                added?null:"Blocks "+link.getBlocked().getIssueKey(),added?"Blocks "+link.getBlocked().getIssueKey():null);
    }
    private void validateGraph(Long projectId,Long changedChild,Long newParent,Long blocker,Long blocked) {
        Map<Long,Set<Long>> graph=new HashMap<>();
        // A child must finish before its parent can finish, so these are prerequisite edges too.
        for(Issue issue:issues.findByProjectIdOrderByCreatedAtDesc(projectId)) {
            graph.computeIfAbsent(issue.getId(),id -> new HashSet<>());
            Long parent=Objects.equals(issue.getId(),changedChild)?newParent:issue.getParent()!=null?issue.getParent().getId():null;
            if(parent!=null) edge(graph,issue.getId(),parent);
        }
        for(IssueDependency link:links.findByBlockerProjectId(projectId)) edge(graph,link.getBlocker().getId(),link.getBlocked().getId());
        if(blocker!=null) edge(graph,blocker,blocked);
        Map<Long,Integer> degree=new HashMap<>(); graph.keySet().forEach(id -> degree.put(id,0));
        graph.values().forEach(targets -> targets.forEach(id -> degree.merge(id,1,Integer::sum)));
        ArrayDeque<Long> ready=new ArrayDeque<>(); degree.forEach((id,count) -> { if(count==0) ready.add(id); });
        int visited=0;
        while(!ready.isEmpty()) { Long id=ready.remove(); visited++; for(Long target:graph.get(id)) if(degree.merge(target,-1,Integer::sum)==0) ready.add(target); }
        if(visited!=graph.size()) throw conflict("This link would create a dependency cycle, including parent-child completion rules");
    }
    private void edge(Map<Long,Set<Long>> graph,Long source,Long target) { graph.computeIfAbsent(source,id -> new HashSet<>()).add(target); graph.computeIfAbsent(target,id -> new HashSet<>()); }
    private ResponseStatusException conflict(String reason) { return new ResponseStatusException(HttpStatus.CONFLICT,reason); }
    private ResponseStatusException missing() { return new ResponseStatusException(HttpStatus.NOT_FOUND); }
}
