import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowDown, ArrowUp, CalendarDays, Plus } from "lucide-react";
import api from "../services/api";
import { orderedBacklog } from "../utils/board";
import type { Issue, Sprint } from "../utils/board";

const field = "w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm";
const button = "rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50";

export default function SprintPlanning({ projectId, issues, sprints, canManage, blocked, compact, focusedSprint, onSelect, onOpenIssue, onChanged, onCompleted, onBusyChange }: {
  projectId: number; issues: Issue[]; sprints: Sprint[]; canManage: boolean; blocked: boolean; compact: boolean;
  focusedSprint?: Sprint; onSelect: (id: number) => void; onOpenIssue: (issue: Issue) => void;
  onChanged: () => Promise<void>; onCompleted: () => void; onBusyChange: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState<{ id?: number; name: string; goal: string; startDate: string; endDate: string } | null>(null);
  const [confirm, setConfirm] = useState<{ sprint: Sprint; action: "complete" | "delete" } | null>(null);
  const disabled = busy || blocked;
  const backlog = orderedBacklog(issues);
  const openSprints = sprints.filter(sprint => sprint.status !== "COMPLETED");
  const activeSprint = sprints.find(sprint => sprint.status === "ACTIVE");

  async function mutate(action: () => Promise<unknown>, message: string, completed = false) {
    if (!canManage || disabled) return;
    setBusy(true); onBusyChange(true); setError(""); setNotice("");
    let saved = false;
    try {
      await action(); saved = true; setForm(null); setConfirm(null); await onChanged(); setNotice(message);
      if (completed) onCompleted();
    } catch (error) {
      const response = (error as { response?: { status?: number; data?: { detail?: string; message?: string } } }).response;
      setError(saved ? "Changes were saved, but refreshing failed. Reload planning before making another change." : response?.data?.detail || response?.data?.message || (response?.status === 409 ? "The planning state changed. Refresh and check the sprint before trying again." : "We couldn't save planning changes. Your inputs are still here. Please try again."));
    } finally { setBusy(false); onBusyChange(false); }
  }
  async function refresh() {
    if (disabled) return;
    setBusy(true); onBusyChange(true); setError(""); setNotice("");
    try { await onChanged(); setNotice("Planning refreshed."); }
    catch { setError("We couldn't refresh planning. Please try again."); }
    finally { setBusy(false); onBusyChange(false); }
  }
  function save(event: FormEvent) {
    event.preventDefault(); if (!form) return;
    if (!form.name.trim() || form.endDate < form.startDate) { setError("Provide a sprint name and an end date on or after its start date."); return; }
    const payload = { name: form.name.trim(), goal: form.goal.trim(), startDate: form.startDate, endDate: form.endDate };
    void mutate(() => form.id ? api.put(`/projects/${projectId}/sprints/${form.id}`, payload) : api.post(`/projects/${projectId}/sprints`, payload), form.id ? "Sprint updated." : "Sprint created. Add issues before starting it.");
  }
  function reorder(index: number, direction: number) {
    const ids = backlog.map(issue => issue.id); [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
    void mutate(() => api.put(`/projects/${projectId}/backlog/order`, { issueIds: ids }), "Backlog order saved.");
  }
  function sprintControls(sprint: Sprint) {
    const scope = issues.filter(issue => issue.type !== "SUBTASK" && issue.type !== "EPIC" && issue.sprintId === sprint.id);
    return canManage && <div className="flex flex-wrap gap-2">
      {sprint.status === "PLANNED" ? <>
        <button type="button" disabled={disabled} className={button} onClick={() => { setError(""); setForm({ id: sprint.id, name: sprint.name, goal: sprint.goal || "", startDate: sprint.startDate, endDate: sprint.endDate }); }}>Edit sprint</button>
        <button type="button" title={activeSprint ? "Complete the active sprint before starting another" : "Add unfinished issues before starting"} disabled={disabled || Boolean(activeSprint) || !scope.some(issue => issue.status !== "DONE")} className={`${button} border-indigo-500/50 text-indigo-300`} onClick={() => void mutate(() => api.patch(`/projects/${projectId}/sprints/${sprint.id}/start`), "Sprint started.")}>Start sprint</button>
        <button type="button" disabled={disabled} className={button} onClick={() => setConfirm({ sprint, action: "delete" })}>Delete planned sprint</button>
      </> : <button type="button" disabled={disabled} className={`${button} border-indigo-500/50 text-indigo-300`} onClick={() => setConfirm({ sprint, action: "complete" })}>Complete sprint</button>}
    </div>;
  }
  function issueRows(items: Issue[], reorderable: boolean) {
    return <div className="divide-y divide-slate-800">{items.map((issue, index) => <article key={issue.id} aria-label={`Planning issue ${issue.title}`} className="flex flex-wrap items-center gap-3 px-4 py-4">
      {reorderable && canManage && <div className="flex gap-1"><button aria-label={`Move ${issue.title} up`} disabled={disabled || index === 0} onClick={() => reorder(index, -1)} className="rounded p-1 text-slate-400 disabled:opacity-30"><ArrowUp size={15} /></button><button aria-label={`Move ${issue.title} down`} disabled={disabled || index === items.length - 1} onClick={() => reorder(index, 1)} className="rounded p-1 text-slate-400 disabled:opacity-30"><ArrowDown size={15} /></button></div>}
      <button type="button" disabled={disabled} onClick={() => onOpenIssue(issue)} className="min-w-0 flex-1 text-left"><span className="break-words text-[10px] text-indigo-300">{issue.issueKey || `ISSUE-${issue.id}`} · {issue.type || "TASK"}</span><strong className="mt-1 block break-words text-sm font-medium">{issue.title}</strong><span className="mt-1 block break-words text-xs text-slate-400">{issue.assigneeName || "Unassigned"} · {issue.storyPoints != null ? `${issue.storyPoints} points` : "Not estimated"} · {issue.status.replaceAll("_", " ").toLowerCase()}</span></button>
      <select aria-label={`Sprint for ${issue.title}`} disabled={!canManage || disabled || issue.status === "DONE"} value={issue.sprintId ?? ""} onChange={event => void mutate(() => api.patch(`/projects/${projectId}/issues/${issue.id}/sprint`, { sprintId: event.target.value ? Number(event.target.value) : null }), "Issue planning updated.")} className="max-w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs disabled:opacity-50"><option value="">Backlog</option>{openSprints.map(sprint => <option key={sprint.id} value={sprint.id}>{sprint.name}{sprint.status === "ACTIVE" ? " (active)" : ""}</option>)}</select>
    </article>)}</div>;
  }
  return <section aria-label="Sprint planning" className="mb-6 space-y-5">
    {error && <p role="alert" className="rounded-lg bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}
    {notice && <p role="status" className="text-xs text-indigo-300">{notice}</p>}
    {!compact && <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0 flex-1"><h3 className="text-lg font-semibold">Backlog & sprints</h3><p className="mt-1 text-xs text-slate-400">Plan the next iteration. Owners manage planning; members can view and discuss issues.</p>{activeSprint && <p className="mt-2 break-words text-xs text-indigo-300">Active sprint: {activeSprint.name}. Only one sprint can be active.</p>}</div><div className="flex flex-wrap gap-2"><button type="button" disabled={disabled} onClick={() => void refresh()} className={button}>Refresh planning</button>{canManage && <button type="button" disabled={disabled} onClick={() => { setError(""); setForm({ name: "", goal: "", startDate: "", endDate: "" }); }} className={`${button} flex items-center gap-2`}><Plus size={15} />Create sprint</button>}</div></div>}
    {form && <form onSubmit={save} aria-label={form.id ? "Edit sprint" : "Create sprint"} className="space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-5"><fieldset disabled={disabled} className="space-y-4"><h4 className="font-semibold">{form.id ? "Edit sprint" : "Plan a sprint"}</h4><div><label htmlFor="sprint-name" className="mb-2 block text-xs">Sprint name</label><input id="sprint-name" required maxLength={150} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} className={field} /></div><div><label htmlFor="sprint-goal" className="mb-2 block text-xs">Sprint goal</label><textarea id="sprint-goal" maxLength={1000} rows={2} value={form.goal} onChange={event => setForm({ ...form, goal: event.target.value })} className={field} /></div><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div><label htmlFor="sprint-start" className="mb-2 block text-xs">Start date</label><input id="sprint-start" required type="date" value={form.startDate} onChange={event => setForm({ ...form, startDate: event.target.value })} className={field} /></div><div><label htmlFor="sprint-end" className="mb-2 block text-xs">End date</label><input id="sprint-end" required type="date" min={form.startDate || undefined} value={form.endDate} onChange={event => setForm({ ...form, endDate: event.target.value })} className={field} /></div></div><div className="flex gap-3"><button type="submit" className={`${button} text-indigo-300`}>{busy ? "Saving..." : "Save sprint"}</button><button type="button" onClick={() => setForm(null)} className={button}>Cancel sprint editing</button></div></fieldset></form>}
    {confirm && <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4"><p className="text-sm font-medium">{confirm.action === "complete" ? `Complete ${confirm.sprint.name}?` : `Delete ${confirm.sprint.name}?`}</p><p className="mt-2 text-xs text-slate-300">{confirm.action === "complete" ? "Save an immutable report. Unfinished issues return to the backlog with their current statuses; done issues stay completed. This sprint cannot be reopened." : "Unfinished issues return to the backlog; done issues stay completed. Only planned sprints can be deleted."}</p><div className="mt-3 flex gap-3"><button disabled={disabled} className={button} onClick={() => void mutate(() => confirm.action === "complete" ? api.patch(`/projects/${projectId}/sprints/${confirm.sprint.id}/complete`) : api.delete(`/projects/${projectId}/sprints/${confirm.sprint.id}`), confirm.action === "complete" ? "Sprint completed. Unfinished work returned to backlog." : "Planned sprint deleted.", confirm.action === "complete")}>{confirm.action === "complete" ? "Confirm completion" : "Confirm sprint deletion"}</button><button disabled={disabled} className={button} onClick={() => setConfirm(null)}>Keep sprint</button></div></div>}
    {compact ? <div className="rounded-xl border border-slate-700 bg-slate-900 p-5"><div className="mb-3 flex justify-end"><button type="button" disabled={disabled} onClick={() => void refresh()} className={button}>Refresh planning</button></div><label htmlFor="board-sprint" className="mb-2 block text-xs text-slate-400">Sprint board</label><select id="board-sprint" disabled={disabled || !openSprints.length} value={focusedSprint?.id ?? ""} onChange={event => onSelect(Number(event.target.value))} className={field}>{!openSprints.length && <option value="">No planned or active sprints</option>}{openSprints.map(sprint => <option key={sprint.id} value={sprint.id}>{sprint.name} · {sprint.status.toLowerCase()}</option>)}</select>{focusedSprint ? <><p className="mt-3 break-words text-sm">{focusedSprint.goal || "No sprint goal set."}</p><p className="my-3 flex items-center gap-2 text-xs text-slate-400"><CalendarDays size={14} />{focusedSprint.startDate} → {focusedSprint.endDate}</p>{sprintControls(focusedSprint)}</> : <p className="mt-3 text-sm text-slate-400">Create a sprint and add issues from the Backlog view.</p>}</div> : <>
      {openSprints.map(sprint => { const scope = issues.filter(issue => issue.type !== "SUBTASK" && issue.type !== "EPIC" && issue.sprintId === sprint.id).sort((a, b) => (a.planningRank ?? a.id) - (b.planningRank ?? b.id)); return <section key={sprint.id} aria-label={`Sprint ${sprint.name}`} className="rounded-xl border border-slate-700 bg-slate-900"><div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 p-4"><div className="min-w-0 flex-1"><h4 className="break-words font-semibold">{sprint.name} <span className="ml-2 text-[10px] uppercase text-indigo-300">{sprint.status}</span></h4><p className="mt-1 break-words text-xs text-slate-400">{sprint.goal || "No goal set"}</p><p className="mt-2 text-xs text-slate-400">{sprint.startDate} → {sprint.endDate} · {scope.length} {scope.length === 1 ? "issue" : "issues"} · {scope.reduce((total, issue) => total + (issue.storyPoints || 0), 0)} points</p>{sprint.status === "ACTIVE" && <p className="mt-2 text-[10px] text-slate-400">At start: {sprint.committedIssueCount} issues / {sprint.committedPoints} points</p>}</div>{sprintControls(sprint)}</div>{scope.length ? issueRows(scope, false) : <p className="p-4 text-xs text-slate-400">Assign issues from the backlog to plan this sprint.</p>}</section>; })}
      <section aria-label="Ordered backlog" className="rounded-xl border border-slate-700 bg-slate-900"><div className="border-b border-slate-800 p-4"><h4 className="font-semibold">Backlog <span className="ml-2 text-xs text-slate-400">{backlog.length} {backlog.length === 1 ? "issue" : "issues"}</span></h4><p className="mt-1 text-xs text-slate-400">Unfinished issues outside a sprint. Order the next work from top to bottom.</p></div>{backlog.length ? issueRows(backlog, true) : <p className="p-5 text-sm text-slate-400">Your backlog is clear. Create an issue or return work from a sprint.</p>}</section>
      <section aria-label="Completed sprints"><h4 className="mb-3 text-sm font-semibold">Completed sprints</h4>{!sprints.some(sprint => sprint.status === "COMPLETED") && <p className="text-xs text-slate-400">Completed sprint reports will appear here.</p>}{sprints.filter(sprint => sprint.status === "COMPLETED").map(sprint => <details key={sprint.id} className="mb-3 rounded-xl border border-slate-700 bg-slate-900 p-4"><summary className="cursor-pointer break-words text-sm font-medium">{sprint.name} · {sprint.snapshots.filter(issue => issue.status === "DONE").length}/{sprint.snapshots.length} completed</summary><p className="mt-3 break-words text-xs text-slate-400">{sprint.goal || "No goal set"} · Completed {sprint.completedAt ? new Date(sprint.completedAt).toLocaleString() : ""}</p><p className="mt-2 text-xs text-slate-400">At start: {sprint.committedIssueCount} issues / {sprint.committedPoints} points. At completion: {sprint.snapshots.filter(issue => issue.status === "DONE").reduce((total, issue) => total + (issue.storyPoints || 0), 0)} points done.</p><p className="mt-2 text-xs text-slate-400">Historical snapshot; later edits and deletions do not change this report.</p><ul className="mt-3 space-y-2">{sprint.snapshots.map(issue => <li key={issue.issueId} className="rounded-lg bg-slate-800 p-3"><p className="break-words text-xs"><span className="text-indigo-300">{issue.issueKey}</span> · {issue.title}</p><p className="mt-1 break-words text-[10px] text-slate-300">{issue.status === "DONE" ? "Completed" : "Returned to backlog"} · {issue.storyPoints ?? "Unestimated"} points · {issue.assigneeName || "Unassigned"}</p></li>)}</ul></details>)}</section>
    </>}
  </section>;
}
