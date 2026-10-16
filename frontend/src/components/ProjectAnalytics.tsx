import { useEffect, useState } from "react";
import api from "../services/api";
import type { Issue } from "../utils/board";
import type { Analytics, Metrics, SprintAnalytics } from "../utils/analytics";

const panel = "min-w-0 rounded-2xl border border-slate-700 bg-slate-900/70 p-4 sm:p-5";
const button = "rounded-lg border border-slate-700 px-3 py-2 text-xs hover:bg-slate-800 disabled:opacity-40";
const field = "w-full min-w-0 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm";
const percent = (value: number, total: number) => total ? Math.round(value * 100 / total) : null;
const signed = (value: number | null, missing = "Not started") => value === null ? missing : value > 0 ? `+${value}` : String(value);

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return <div className={panel}><p className="text-xs text-slate-400">{label}</p><p className="mt-2 text-2xl font-semibold text-slate-100">{value}</p>{hint && <p className="mt-2 text-[11px] text-slate-500">{hint}</p>}</div>;
}

function StatusBreakdown({ metrics, label }: { metrics: Metrics; label: string }) {
  const statuses = [
    { name: "To do", value: metrics.todo, color: "bg-slate-500" },
    { name: "In progress", value: metrics.inProgress, color: "bg-indigo-400" },
    { name: "Done", value: metrics.done, color: "bg-emerald-400" },
  ];
  return <div>
    <div role="img" aria-label={`${label}: ${metrics.todo} to do, ${metrics.inProgress} in progress, ${metrics.done} done`} className="mt-4 flex h-3 overflow-hidden rounded-full bg-slate-800">
      {statuses.map(status => <span key={status.name} style={{ width: `${metrics.total ? status.value * 100 / metrics.total : 0}%` }} className={status.color} />)}
    </div>
    <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs">{statuses.map(status => <div key={status.name} className="flex items-center gap-2"><span aria-hidden="true" className={`h-2 w-2 rounded-full ${status.color}`} /><dt className="text-slate-400">{status.name}</dt><dd className="font-medium">{status.value}</dd></div>)}</dl>
    <p className="mt-4 text-xs text-slate-400">{metrics.total ? `${metrics.done}/${metrics.total} issues complete (${percent(metrics.done, metrics.total)}%).` : "No scoped work yet."} {metrics.completedPoints}/{metrics.totalPoints} estimated points completed.</p>
    <p className="mt-2 text-[11px] text-slate-500">{metrics.estimatedIssues}/{metrics.total} issues estimated. Unestimated work still counts toward issue completion.</p>
  </div>;
}

function Workload({ rows }: { rows: Analytics["workload"] }) {
  const maxOpen = Math.max(1, ...rows.map(row => row.metrics.total - row.metrics.done));
  return <section aria-label="Current assignee workload" className={panel}>
    <h4 className="text-sm font-semibold">Current assignments</h4>
    <p className="mb-4 mt-2 text-xs text-slate-400">Current issue ownership across the project; open counts show remaining work, not a person's productivity or capacity.</p>
    <div className="overflow-x-auto"><table className="w-full text-left text-xs">
      <caption className="sr-only">Project workload grouped by current assignee, including unassigned work</caption>
      <thead className="text-slate-500"><tr>{["Assignee", "Open", "Done", "Overdue", "Blocked", "Total points"].map(label => <th key={label} className="whitespace-nowrap px-2 py-3 font-medium">{label}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={row.userId ?? "unassigned"} className="border-t border-slate-800">
        <th scope="row" className="min-w-32 max-w-56 break-words px-2 py-3 font-medium"><span>{row.name}</span><span aria-hidden="true" className="mt-2 block h-1 rounded-full bg-slate-800"><span style={{ width: `${(row.metrics.total - row.metrics.done) * 100 / maxOpen}%` }} className="block h-1 rounded-full bg-indigo-400" /></span></th>
        {[row.metrics.total - row.metrics.done, row.metrics.done, row.metrics.overdue, row.metrics.blocked, row.metrics.totalPoints].map((value, index) => <td key={index} className="px-2 py-3 text-slate-400">{value ?? "Unavailable"}</td>)}
      </tr>)}</tbody>
    </table></div>
  </section>;
}

function SprintReport({ sprint }: { sprint: SprintAnalytics }) {
  const historical = sprint.status === "COMPLETED";
  const missingCommitment = sprint.status === "PLANNED" ? "Not started" : "Not recorded";
  return <section aria-label="Selected sprint report" className={panel}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><h4 className="break-words text-lg font-semibold">{sprint.name}</h4><p className="mt-2 break-words text-xs text-slate-400">{sprint.goal || "No sprint goal set."}</p></div><span className="rounded bg-indigo-500/15 px-2 py-1 text-[10px] uppercase text-indigo-300">{sprint.status}</span></div>
    <p className="mt-3 text-xs text-slate-500">Scheduled {sprint.startDate} to {sprint.endDate}{sprint.completedAt && ` · Completed ${new Date(sprint.completedAt).toLocaleString()}`}</p>
    <p className="mt-3 text-xs text-indigo-300">{historical ? "Historical completion snapshot. Later issue edits and deletions do not change these figures." : "Live sprint scope. Figures reflect current issue statuses, estimates and allocations."}</p>
    <StatusBreakdown metrics={sprint.metrics} label="Sprint status distribution" />
    <dl className="mt-5 grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
      <div><dt className="text-slate-500">Issues at start</dt><dd className="mt-2 font-semibold">{sprint.committedIssues ?? missingCommitment}</dd></div>
      <div><dt className="text-slate-500">Points at start</dt><dd className="mt-2 font-semibold">{sprint.committedPoints ?? missingCommitment}</dd></div>
      <div><dt className="text-slate-500">Net issue scope change</dt><dd className="mt-2 font-semibold">{signed(sprint.netIssueChange, missingCommitment)}</dd></div>
      <div><dt className="text-slate-500">Net estimated points change</dt><dd className="mt-2 font-semibold">{signed(sprint.netPointChange, missingCommitment)}</dd></div>
    </dl>
    <p className="mt-4 text-[11px] leading-5 text-slate-500">Net change compares {historical ? "final" : "current"} scope to the initial commitment; point changes also reflect estimate edits. Completed issues are counted within {historical ? "the final" : "the current"} scope.</p>
    {!historical && <p className="mt-3 text-xs text-slate-400">{sprint.metrics.overdue ?? 0} overdue · {sprint.metrics.blocked ?? 0} blocked unfinished issues.</p>}
    {historical && <p className="mt-3 text-xs text-slate-500">Historical overdue and blocker counts are unavailable in completion snapshots.</p>}
  </section>;
}

function DeliveryTrend({ data }: { data: Analytics }) {
  const [metric, setMetric] = useState<"points" | "issues">("points");
  const byId = new Map(data.sprints.map(sprint => [sprint.id, sprint]));
  const sample = data.trend.recentSprintIds.map(id => byId.get(id)).filter((sprint): sprint is SprintAnalytics => Boolean(sprint)).reverse();
  const done = (sprint: SprintAnalytics) => metric === "points" ? sprint.metrics.completedPoints : sprint.metrics.done;
  const committed = (sprint: SprintAnalytics) => metric === "points" ? sprint.committedPoints : sprint.committedIssues;
  const maximum = Math.max(1, ...sample.flatMap(sprint => [done(sprint), committed(sprint) || 0]));
  return <section aria-label="Sprint delivery trend" className={panel}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="text-sm font-semibold">Sprint delivery trend</h4><div className="flex gap-2">{(["points", "issues"] as const).map(value => <button key={value} type="button" aria-pressed={metric === value} onClick={() => setMetric(value)} className={`${button} ${metric === value ? "bg-indigo-500/15 text-indigo-300" : "text-slate-400"}`}>{value === "points" ? "Compare points" : "Compare issues"}</button>)}</div></div>
    <p className="mt-2 text-xs text-slate-400">Last {data.trend.sampleSize} completed sprints, ordered by completion. Compares initial commitment with completed work in the final scope.</p>
    {!sample.length ? <p className="py-8 text-sm text-slate-500">Complete a sprint to see delivery trends. No historical results have been recorded yet.</p> : <>
      <div className="my-4 flex flex-wrap gap-4 text-xs text-slate-400"><span className="flex items-center gap-2"><span aria-hidden="true" className="h-2 w-2 bg-slate-500" />Initial commitment</span><span className="flex items-center gap-2"><span aria-hidden="true" className="h-2 w-2 bg-emerald-400" />Completed in final scope</span></div>
      <ol className="space-y-5">{sample.map(sprint => <li key={sprint.id} className="min-w-0"><p className="mb-2 break-words text-xs font-medium">{sprint.name}</p><div role="img" aria-label={`${sprint.name}: ${committed(sprint) ?? "unknown"} ${metric} initially committed, ${done(sprint)} completed`} className="space-y-2"><div className="h-2 overflow-hidden rounded bg-slate-800"><div style={{ width: `${(committed(sprint) || 0) * 100 / maximum}%` }} className="h-full rounded bg-slate-500" /></div><div className="h-2 overflow-hidden rounded bg-slate-800"><div style={{ width: `${done(sprint) * 100 / maximum}%` }} className="h-full rounded bg-emerald-400" /></div></div><p className="mt-2 text-[11px] text-slate-400">{committed(sprint) ?? "Unknown"} committed / {done(sprint)} completed {metric}</p></li>)}</ol>
    </>}
    <p className="mt-5 text-[11px] leading-5 text-slate-500">Only estimated work contributes to points. This chart compares sprint-end delivery; it does not show daily progress.</p>
  </section>;
}

export default function ProjectAnalytics({ projectId, revision, disabled }: { projectId: number; revision: readonly Issue[]; disabled: boolean }) {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    api.get<Analytics>(`/projects/${projectId}/analytics`, { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) { setData(data); setError(""); } })
      .catch(() => { if (!controller.signal.aborted) setError("We couldn't load the latest analytics. Please retry."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [projectId, revision, refresh]);
  const selected = data?.sprints.find(sprint => String(sprint.id) === selectedId)
    || data?.sprints.find(sprint => sprint.status === "ACTIVE")
    || data?.sprints.find(sprint => sprint.id === data.trend.recentSprintIds[0]) || data?.sprints[0];
  return <section aria-label="Project and sprint analytics" className="min-w-0 space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><h3 className="text-lg font-semibold">Project & sprint analytics</h3><p className="mt-2 text-xs leading-5 text-slate-400">Headline metrics count stories, tasks and bugs once. Epics and subtasks are shown separately.</p>{data && <p className="mt-2 text-[11px] text-slate-500">Updated {new Date(data.generatedAt).toLocaleString()} · Overdue uses server date {data.asOfDate}.</p>}</div><button type="button" disabled={disabled || loading} onClick={() => { setLoading(true); setRefresh(value => value + 1); }} className={button}>Refresh analytics</button></div>
    {loading && <p role="status" className="text-sm text-slate-400">Loading analytics...</p>}
    {error && <div role="alert" className="rounded-xl bg-rose-500/10 p-4 text-sm text-rose-300">{error}{data && <span> Figures below are from the last successful refresh.</span>}<button type="button" disabled={disabled || loading} onClick={() => { setLoading(true); setRefresh(value => value + 1); }} className="ml-2 underline">Retry analytics</button></div>}
    {data && <>
      <div aria-label="Project analytics summary" className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat label="Total work items" value={data.project.total} /><Stat label="Open work" value={data.project.total - data.project.done} />
        <Stat label="Completed work" value={data.project.done} /><Stat label="Overdue work" value={data.project.overdue ?? "Unavailable"} />
        <Stat label="Blocked work" value={data.project.blocked ?? "Unavailable"} /><Stat label="Backlog work" value={data.backlogIssues} />
      </div>
      {!data.project.total && <p className="rounded-xl border border-dashed border-slate-700 p-5 text-sm text-slate-400">No stories, tasks or bugs yet. Create work to begin tracking project progress.</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-label="Project status breakdown" className={panel}><h4 className="text-sm font-semibold">Project progress</h4><StatusBreakdown metrics={data.project} label="Project status distribution" /><p className="mt-4 text-xs text-slate-500">Tracked separately: {data.epicCount} epics · {data.subtaskCount} subtasks.</p></section>
        <section aria-label="Issue type breakdown" className={panel}><h4 className="text-sm font-semibold">Work by type</h4><dl className="mt-4 space-y-4">{data.types.map(type => <div key={type.type}><div className="flex justify-between gap-3 text-xs"><dt className="capitalize text-slate-400">{type.type.toLowerCase()}</dt><dd>{type.done}/{type.total} done</dd></div><div aria-hidden="true" className="mt-2 h-2 overflow-hidden rounded bg-slate-800"><div style={{ width: `${percent(type.done, type.total) || 0}%` }} className="h-full rounded bg-indigo-400" /></div></div>)}</dl></section>
      </div>
      <Workload rows={data.workload} />
      <section aria-label="Work needing attention" className={panel}><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold">Needs attention</h4><span className="text-xs text-slate-500">{data.attentionTotal} overdue or blocked unfinished issues</span></div><p className="mb-4 mt-2 text-xs text-slate-400">Blocked work first, then overdue work and earliest due dates. Showing up to 20 issues.</p>
        {!data.attention.length ? <p className="py-4 text-sm text-slate-500">No overdue or blocked unfinished work.</p> : <ul className="space-y-3">{data.attention.map(issue => <li key={issue.issueId} className="rounded-xl border border-slate-800 bg-slate-800/40 p-4"><a href={`#project=${projectId}&issue=${issue.issueId}`} target="_blank" rel="noopener noreferrer" aria-label={`Open ${issue.issueKey} in a new tab`} className="block break-words text-sm font-medium hover:text-indigo-300"><span className="mr-2 text-xs text-indigo-300">{issue.issueKey}</span>{issue.title}</a><p className="mt-2 break-words text-xs text-slate-400">{issue.assigneeName || "Unassigned"} · {issue.priority.toLowerCase()} priority{issue.dueDate && ` · Due ${issue.dueDate}`}</p><div className="mt-2 flex flex-wrap gap-2 text-[10px] text-rose-300">{issue.overdue && <span>Overdue</span>}{issue.blockers.length > 0 && <span className="break-words">Blocked by {issue.blockers.join(", ")}</span>}</div></li>)}</ul>}
      </section>
      <div aria-label="Sprint delivery averages" className="grid gap-3 sm:grid-cols-3"><Stat label="Completed sprints" value={data.trend.completedSprints} /><Stat label="Average completed issues" value={data.trend.averageCompletedIssues?.toFixed(1) ?? "No history"} hint={`Last ${data.trend.sampleSize} completed sprints`} /><Stat label="Average completed points" value={data.trend.averageCompletedPoints?.toFixed(1) ?? "No history"} hint={`Last ${data.trend.sampleSize} completed sprints; estimated work only`} /></div>
      <DeliveryTrend data={data} />
      <section aria-label="Sprint analytics"><label htmlFor="analytics-sprint" className="mb-2 block text-sm font-semibold">Sprint report</label><select id="analytics-sprint" disabled={disabled || !data.sprints.length} value={selected?.id ?? ""} onChange={event => setSelectedId(event.target.value)} className={field}>{!data.sprints.length && <option value="">No sprints yet</option>}{data.sprints.map(sprint => <option key={sprint.id} value={sprint.id}>{sprint.name} · {sprint.status.toLowerCase()}</option>)}</select><div className="mt-4">{selected ? <SprintReport sprint={selected} /> : <p className="rounded-xl border border-dashed border-slate-700 p-5 text-sm text-slate-400">Create a sprint and add work from the Backlog view to see sprint analytics.</p>}</div></section>
    </>}
  </section>;
}
