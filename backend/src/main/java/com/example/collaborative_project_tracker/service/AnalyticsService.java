package com.example.collaborative_project_tracker.service;

import com.example.collaborative_project_tracker.dto.AnalyticsResponse;
import com.example.collaborative_project_tracker.dto.AnalyticsResponse.*;
import com.example.collaborative_project_tracker.model.*;
import com.example.collaborative_project_tracker.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class AnalyticsService {
    private final IssueRepository issues;
    private final SprintRepository sprints;
    private final IssueDependencyRepository dependencies;
    private final ProjectMembershipRepository members;
    private final MembershipService membership;
    public AnalyticsService(IssueRepository issues, SprintRepository sprints, IssueDependencyRepository dependencies,
                            ProjectMembershipRepository members, MembershipService membership) {
        this.issues=issues; this.sprints=sprints; this.dependencies=dependencies; this.members=members; this.membership=membership;
    }
    @Transactional(readOnly=true)
    public AnalyticsResponse get(Long projectId, String email) {
        membership.requireMember(projectId,email);
        return calculate(issues.findByProjectIdOrderByCreatedAtDesc(projectId), sprints.findByProjectIdOrderByIdDesc(projectId),
                dependencies.findByBlockerProjectId(projectId), members.findByProjectId(projectId), LocalDate.now(), Instant.now());
    }
    AnalyticsResponse calculate(List<Issue> all, List<Sprint> sprints, List<IssueDependency> links,
                                List<ProjectMembership> members, LocalDate today, Instant generatedAt) {
        List<Issue> work=all.stream().filter(Issue::isPlannable).toList();
        Map<Long,List<String>> blockers=new HashMap<>();
        for(IssueDependency link:links) if(link.getBlocker().getStatus()!=IssueStatus.DONE) {
            blockers.computeIfAbsent(link.getBlocked().getId(),id -> new ArrayList<>()).add(link.getBlocker().getIssueKey());
        }
        blockers.replaceAll((id,keys) -> keys.stream().distinct().sorted().toList());
        List<Attention> attention=work.stream().filter(issue -> issue.getStatus()!=IssueStatus.DONE)
            .filter(issue -> overdue(issue,today) || blockers.containsKey(issue.getId()))
            .sorted(Comparator.<Issue,Boolean>comparing(issue -> !blockers.containsKey(issue.getId()))
                .thenComparing(issue -> !overdue(issue,today))
                .thenComparing(Issue::getDueDate,Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(Issue::getId))
            .map(issue -> new Attention(issue.getId(),issue.getIssueKey(),issue.getTitle(),issue.getStatus(),issue.getPriority(),
                issue.getAssignee()!=null?issue.getAssignee().getName():null,issue.getDueDate(),overdue(issue,today),blockers.getOrDefault(issue.getId(),List.of()))).toList();
        Map<Long,List<Issue>> bySprint=work.stream().filter(issue -> issue.getSprint()!=null)
            .collect(Collectors.groupingBy(issue -> issue.getSprint().getId()));
        List<SprintAnalytics> reports=sprints.stream().map(sprint -> {
            Metrics metrics=sprint.getStatus()==SprintStatus.COMPLETED?snapshotMetrics(sprint.getSnapshots()):metrics(bySprint.getOrDefault(sprint.getId(),List.of()),blockers,today);
            return new SprintAnalytics(sprint.getId(),sprint.getName(),sprint.getGoal(),sprint.getStatus(),sprint.getStartDate(),sprint.getEndDate(),
                sprint.getStartedAt(),sprint.getCompletedAt(),sprint.getCommittedIssueCount(),sprint.getCommittedPoints(),
                sprint.getCommittedIssueCount()!=null?metrics.total()-sprint.getCommittedIssueCount():null,
                sprint.getCommittedPoints()!=null?metrics.totalPoints()-sprint.getCommittedPoints():null,metrics);
        }).toList();
        List<SprintAnalytics> completed=reports.stream().filter(sprint -> sprint.status()==SprintStatus.COMPLETED)
            .sorted(Comparator.comparing(SprintAnalytics::completedAt,Comparator.nullsLast(Comparator.reverseOrder()))
                .thenComparing(SprintAnalytics::id,Comparator.reverseOrder())).toList();
        List<SprintAnalytics> sample=completed.stream().limit(5).toList();
        Trend trend=new Trend(completed.size(),sample.size(),sample.isEmpty()?null:sample.stream().mapToInt(sprint -> sprint.metrics().done()).average().orElseThrow(),
            sample.isEmpty()?null:sample.stream().mapToInt(sprint -> sprint.metrics().completedPoints()).average().orElseThrow(),sample.stream().map(SprintAnalytics::id).toList());
        List<TypeCount> types=List.of(IssueType.STORY,IssueType.TASK,IssueType.BUG).stream().map(type -> {
            List<Issue> scope=work.stream().filter(issue -> issue.getType()==type).toList();
            return new TypeCount(type,scope.size(),(int)scope.stream().filter(issue -> issue.getStatus()==IssueStatus.DONE).count());
        }).toList();
        return new AnalyticsResponse(generatedAt,today,metrics(work,blockers,today),
            (int)all.stream().filter(issue -> issue.getType()==IssueType.EPIC).count(),
            (int)all.stream().filter(issue -> issue.getType()==IssueType.SUBTASK).count(),
            (int)work.stream().filter(issue -> issue.getSprint()==null && issue.getStatus()!=IssueStatus.DONE).count(),
            types,workload(work,members,blockers,today),attention.size(),attention.stream().limit(20).toList(),reports,trend);
    }
    private Metrics metrics(List<Issue> work,Map<Long,List<String>> blockers,LocalDate today) {
        Metrics counts=count(work,Issue::getStatus,Issue::getStoryPoints);
        return new Metrics(counts.total(),counts.todo(),counts.inProgress(),counts.done(),counts.estimatedIssues(),counts.totalPoints(),counts.completedPoints(),
                (int)work.stream().filter(issue -> overdue(issue,today)).count(),
                (int)work.stream().filter(issue -> issue.getStatus()!=IssueStatus.DONE && blockers.containsKey(issue.getId())).count());
    }
    private Metrics snapshotMetrics(List<SprintSnapshot> snapshots) { return count(snapshots,SprintSnapshot::getStatus,SprintSnapshot::getStoryPoints); }
    private <T> Metrics count(List<T> scope,Function<T,IssueStatus> status,Function<T,Integer> points) {
        int todo=0,progress=0,done=0,estimated=0,totalPoints=0,completedPoints=0;
        for(T item:scope) {
            switch(status.apply(item)) { case TODO -> todo++; case IN_PROGRESS -> progress++; case DONE -> done++; }
            Integer estimate=points.apply(item);
            if(estimate!=null) { estimated++; totalPoints+=estimate; if(status.apply(item)==IssueStatus.DONE) completedPoints+=estimate; }
        }
        return new Metrics(scope.size(),todo,progress,done,estimated,totalPoints,completedPoints,null,null);
    }
    private List<Workload> workload(List<Issue> work,List<ProjectMembership> members,Map<Long,List<String>> blockers,LocalDate today) {
        Map<Long,String> names=new HashMap<>(); members.forEach(member -> names.put(member.getUser().getId(),member.getUser().getName()));
        work.stream().filter(issue -> issue.getAssignee()!=null).forEach(issue -> names.putIfAbsent(issue.getAssignee().getId(),issue.getAssignee().getName()));
        Map<Long,List<Issue>> grouped=work.stream().filter(issue -> issue.getAssignee()!=null).collect(Collectors.groupingBy(issue -> issue.getAssignee().getId()));
        List<Workload> result=new ArrayList<>();
        names.forEach((id,name) -> result.add(new Workload(id,name,metrics(grouped.getOrDefault(id,List.of()),blockers,today))));
        result.sort(Comparator.<Workload>comparingInt(row -> row.metrics().total()-row.metrics().done()).reversed()
            .thenComparing(Workload::name,String.CASE_INSENSITIVE_ORDER).thenComparing(Workload::userId));
        result.add(new Workload(null,"Unassigned",metrics(work.stream().filter(issue -> issue.getAssignee()==null).toList(),blockers,today)));
        return result;
    }
    private boolean overdue(Issue issue,LocalDate today) { return issue.getStatus()!=IssueStatus.DONE && issue.getDueDate()!=null && issue.getDueDate().isBefore(today); }
}
