package com.example.collaborative_project_tracker.service;

import com.example.collaborative_project_tracker.dto.*;
import com.example.collaborative_project_tracker.model.*;
import com.example.collaborative_project_tracker.repository.*;
import jakarta.persistence.criteria.*;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDate;
import java.util.*;

@Service
public class IssueSearchService {
    private final IssueRepository issues;
    private final ProjectRepository projects;
    private final UserRepository users;
    private final SavedIssueFilterRepository filters;
    private final MembershipService membership;
    private final IssueService issueService;
    public IssueSearchService(IssueRepository issues, ProjectRepository projects, UserRepository users,
            SavedIssueFilterRepository filters, MembershipService membership, IssueService issueService) {
        this.issues=issues; this.projects=projects; this.users=users; this.filters=filters; this.membership=membership; this.issueService=issueService;
    }
    @Transactional(readOnly=true)
    public IssueSearchResponse search(Long projectId, IssueSearchRequest request, String email) {
        membership.requireMember(projectId,email);
        IssueSearchRequest criteria=normalize(request);
        Project project=projects.findById(projectId).orElseThrow(this::missing);
        AppUser user=user(email);
        var result=issues.findAll(specification(project,criteria,user.getId(),LocalDate.now()),PageRequest.of(criteria.page(),criteria.size()));
        return new IssueSearchResponse(result.getContent().stream().map(issueService::toResponse).toList(),result.getTotalElements(),result.getTotalPages(),result.getNumber(),result.getSize());
    }
    @Transactional(readOnly=true)
    public List<SavedFilterResponse> list(Long projectId,String email) {
        membership.requireMember(projectId,email);
        return filters.findByProjectIdAndUserIdOrderByNameAscIdAsc(projectId,user(email).getId()).stream().map(this::response).toList();
    }
    @Transactional
    public SavedFilterResponse save(Long projectId,Long filterId,SavedFilterRequest request,String email) {
        Project project=projects.findLockedById(projectId).orElseThrow(this::missing);
        membership.requireMember(projectId,email); AppUser actor=user(email);
        if (request.name()==null || request.name().isBlank() || request.name().trim().length()>80) throw bad("Use a filter name of 1-80 characters");
        IssueSearchRequest criteria=normalize(request.criteria());
        SavedIssueFilter filter;
        if (filterId==null) {
            if(filters.countByProjectIdAndUserId(projectId,actor.getId())>=20) throw new ResponseStatusException(HttpStatus.CONFLICT,"You can save up to 20 filters per project");
            filter=new SavedIssueFilter(); filter.setProject(project); filter.setUser(actor);
        } else filter=filters.findByIdAndProjectIdAndUserId(filterId,projectId,actor.getId()).orElseThrow(this::missing);
        filter.setName(request.name().trim()); filter.apply(criteria); return response(filters.save(filter));
    }
    @Transactional
    public void delete(Long projectId,Long filterId,String email) {
        projects.findLockedById(projectId).orElseThrow(this::missing); membership.requireMember(projectId,email);
        filters.delete(filters.findByIdAndProjectIdAndUserId(filterId,projectId,user(email).getId()).orElseThrow(this::missing));
    }
    IssueSearchRequest normalize(IssueSearchRequest request) {
        if(request==null) throw bad("Provide search criteria");
        String q=clean(request.q()),status=clean(request.status()),type=clean(request.type()),priority=clean(request.priority());
        String assignee=clean(request.assignee()),sprint=clean(request.sprint()),label=clean(request.label());
        if(q!=null && q.length()>150) throw bad("Search text must be at most 150 characters");
        enumeration(status,IssueStatus.class); enumeration(type,IssueType.class); enumeration(priority,IssuePriority.class);
        if(assignee!=null && !List.of("me","unassigned").contains(assignee)) positive(assignee);
        if(sprint!=null && !sprint.equals("backlog")) positive(sprint);
        if(request.epicId()!=null && request.epicId()<1) throw bad("Epic ID must be positive");
        if(label!=null && !label.matches("[a-zA-Z0-9][a-zA-Z0-9_-]{0,29}")) throw bad("Use a single valid label");
        if(request.dueFrom()!=null && request.dueTo()!=null && request.dueFrom().isAfter(request.dueTo())) throw bad("Due date end must be on or after its start");
        String sort=clean(request.sort()); if(sort==null) sort="created_desc";
        if(!List.of("created_desc","key_asc","due_asc","priority_desc").contains(sort)) throw bad("Unsupported sort order");
        int page=request.page()!=null?request.page():0,size=request.size()!=null?request.size():20;
        if(page<0 || page>100000 || size<1 || size>100) throw bad("Page must be 0-100000 and page size 1-100");
        return new IssueSearchRequest(q,status,type,priority,assignee,request.epicId(),sprint,label!=null?label.toLowerCase(Locale.ROOT):null,
                Boolean.TRUE.equals(request.overdue()),request.dueFrom(),request.dueTo(),sort,page,size);
    }
    Specification<Issue> specification(Project project,IssueSearchRequest c,Long actorId,LocalDate today) {
        return (root,query,cb) -> {
            var parent=root.join("parent",JoinType.LEFT);
            var grandparent=parent.join("parent",JoinType.LEFT);
            var ownSprint=root.join("sprint",JoinType.LEFT);
            var parentSprint=parent.join("sprint",JoinType.LEFT);
            Expression<IssueType> type=cb.coalesce(root.<IssueType>get("type"),IssueType.TASK);
            Expression<Long> sprint=cb.<Long>selectCase().when(cb.equal(type,IssueType.SUBTASK),parentSprint.get("id")).otherwise(ownSprint.get("id"));
            List<Predicate> predicates=new ArrayList<>(); predicates.add(cb.equal(root.get("project").get("id"),project.getId()));
            if(c.q()!=null) {
                String pattern="%"+escape(c.q().toLowerCase(Locale.ROOT))+"%";
                Expression<String> key=cb.concat(project.getDisplayKey().toLowerCase(Locale.ROOT)+"-",cb.coalesce(root.<Long>get("issueNumber"),root.<Long>get("id")).as(String.class));
                predicates.add(cb.or(cb.like(cb.lower(root.get("title")),pattern,'!'),cb.like(cb.lower(root.get("labels")),pattern,'!'),cb.like(key,pattern,'!')));
            }
            if(c.status()!=null) predicates.add(cb.equal(root.get("status"),IssueStatus.valueOf(c.status())));
            if(c.type()!=null) predicates.add(cb.equal(type,IssueType.valueOf(c.type())));
            if(c.priority()!=null) predicates.add(cb.equal(root.get("priority"),IssuePriority.valueOf(c.priority())));
            if(c.assignee()!=null) predicates.add(c.assignee().equals("unassigned")?cb.isNull(root.get("assignee")):cb.equal(root.get("assignee").get("id"),c.assignee().equals("me")?actorId:Long.parseLong(c.assignee())));
            if(c.epicId()!=null) predicates.add(cb.or(cb.and(cb.equal(parent.get("id"),c.epicId()),cb.equal(parent.get("type"),IssueType.EPIC)),cb.and(cb.equal(grandparent.get("id"),c.epicId()),cb.equal(grandparent.get("type"),IssueType.EPIC))));
            if(c.sprint()!=null) {
                predicates.add(cb.notEqual(type,IssueType.EPIC));
                predicates.add(c.sprint().equals("backlog")?cb.and(cb.isNull(sprint),cb.notEqual(root.get("status"),IssueStatus.DONE)):cb.equal(sprint,Long.parseLong(c.sprint())));
            }
            if(c.label()!=null) predicates.add(cb.like(cb.concat(cb.concat(",",cb.lower(root.get("labels"))),","),"%,"+escape(c.label())+",%",'!'));
            if(Boolean.TRUE.equals(c.overdue())) predicates.add(cb.and(cb.notEqual(root.get("status"),IssueStatus.DONE),cb.lessThan(root.get("dueDate"),today)));
            if(c.dueFrom()!=null) predicates.add(cb.greaterThanOrEqualTo(root.get("dueDate"),c.dueFrom()));
            if(c.dueTo()!=null) predicates.add(cb.lessThanOrEqualTo(root.get("dueDate"),c.dueTo()));
            if(query!=null && query.getResultType()!=Long.class) {
                List<Order> order=new ArrayList<>();
                switch(c.sort()) {
                    case "key_asc" -> order.add(cb.asc(cb.coalesce(root.<Long>get("issueNumber"),root.<Long>get("id"))));
                    case "due_asc" -> { order.add(cb.asc(cb.selectCase().when(cb.isNull(root.get("dueDate")),1).otherwise(0))); order.add(cb.asc(root.get("dueDate"))); }
                    case "priority_desc" -> order.add(cb.desc(cb.selectCase().when(cb.equal(root.get("priority"),IssuePriority.HIGH),3).when(cb.equal(root.get("priority"),IssuePriority.MEDIUM),2).otherwise(1)));
                    default -> order.add(cb.desc(root.get("createdAt")));
                }
                order.add(cb.asc(root.get("id"))); query.orderBy(order);
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }
    private String clean(String text) { return text==null || text.isBlank()?null:text.trim(); }
    private String escape(String text) { return text.replace("!","!!").replace("%","!%").replace("_","!_"); }
    private void positive(String text) { try { if(Long.parseLong(text)<1) throw bad("ID must be positive"); } catch(NumberFormatException error) { throw bad("Invalid ID"); } }
    private <E extends Enum<E>> void enumeration(String value,Class<E> type) { if(value!=null) try { Enum.valueOf(type,value); } catch(IllegalArgumentException error) { throw bad("Invalid "+type.getSimpleName()); } }
    private AppUser user(String email) { return users.findByEmailIgnoreCase(email).orElseThrow(()->new ResponseStatusException(HttpStatus.UNAUTHORIZED)); }
    private SavedFilterResponse response(SavedIssueFilter filter) { return new SavedFilterResponse(filter.getId(),filter.getName(),filter.criteria()); }
    private ResponseStatusException missing() { return new ResponseStatusException(HttpStatus.NOT_FOUND); }
    private ResponseStatusException bad(String reason) { return new ResponseStatusException(HttpStatus.BAD_REQUEST,reason); }
}
