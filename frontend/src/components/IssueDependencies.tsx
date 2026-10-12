import { useRef, useState } from "react";
import api from "../services/api";
import { unresolvedBlockers } from "../utils/board";
import type { Issue, DependencyItem } from "../utils/board";

const button = "rounded-lg border border-slate-700 px-3 py-2 text-xs hover:bg-slate-800 disabled:opacity-40";
const field = "w-full min-w-0 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs";
export default function IssueDependencies({ projectId, issue, issues, canManage, disabled, onOpen, onChanged, onBusyChange, onStaleChange }: {
  projectId: number; issue: Issue; issues: Issue[]; canManage: boolean; disabled: boolean;
  onOpen: (issue: Issue) => void; onChanged: () => Promise<void>; onBusyChange: (busy: boolean) => void; onStaleChange: (stale: boolean) => void;
}) {
  const [direction, setDirection] = useState("BLOCKED_BY");
  const [targetId, setTargetId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const lock = useRef(false);
  const blockers = unresolvedBlockers(issue);
  async function mutate(action: () => Promise<unknown>) {
    if (disabled || lock.current || refreshFailed) return;
    lock.current = true; onBusyChange(true); setError(""); setNotice("");
    try {
      await action(); setConfirmId(null); setTargetId("");
      try { await onChanged(); onStaleChange(false); setNotice("Dependencies updated."); }
      catch { setRefreshFailed(true); onStaleChange(true); setError("The dependency change was saved, but the issue list could not refresh. Reload dependencies before making another change."); }
    } catch (error) { setError((error as { response?: { data?: { detail?: string } } }).response?.data?.detail || "We couldn't save the dependency change. Please try again."); }
    finally { lock.current = false; onBusyChange(false); }
  }
  async function refresh() {
    if (disabled || lock.current) return;
    lock.current = true; onBusyChange(true);
    try { await onChanged(); setError(""); setRefreshFailed(false); onStaleChange(false); setNotice("Dependencies refreshed."); }
    catch { setError("We couldn't refresh dependencies. Please try again."); }
    finally { lock.current = false; onBusyChange(false); }
  }
  function rows(items: DependencyItem[], incoming: boolean) {
    return <ul className="space-y-2">{items.map(link => <li key={link.id} className="rounded-lg border border-slate-800 bg-slate-800/40 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2"><button type="button" disabled={disabled} onClick={() => { const target = issues.find(item => item.id === link.issueId); if (target) onOpen(target); }} className="min-w-0 flex-1 break-words text-left text-xs"><span className="text-indigo-300">{link.issueKey}</span><strong className="mt-1 block font-medium">{link.title}</strong><span className={`mt-1 block ${incoming && link.status !== "DONE" ? "text-rose-300" : "text-slate-400"}`}>{link.status === "DONE" ? "Done" : link.status === "IN_PROGRESS" ? "In progress" : "To do"}{incoming && link.status !== "DONE" && " - prevents status changes"}</span></button>{canManage && <button type="button" disabled={disabled || refreshFailed} aria-label={`Remove dependency ${link.issueKey}`} onClick={() => setConfirmId(link.id)} className={`${button} text-rose-300`}>Remove link</button>}</div>
      {confirmId === link.id && <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={disabled || refreshFailed} onClick={() => void mutate(() => api.delete(`/projects/${projectId}/issues/${issue.id}/dependencies/${link.id}`))} className={button}>Confirm link removal</button><button type="button" disabled={disabled} onClick={() => setConfirmId(null)} className={button}>Keep link</button></div>}
    </li>)}</ul>;
  }
  return <section aria-label="Issue dependencies" className="mx-6 mb-6 space-y-4 border-t border-slate-800 pt-6">
    <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold">Dependencies</h4><button type="button" disabled={disabled} onClick={() => void refresh()} className={button}>{refreshFailed ? "Reload dependencies" : "Refresh dependencies"}</button></div>
    <p className="text-xs text-slate-400">All blockers must be done before the owner or assignee can change this issue's status. Members can view links and discuss the work.</p>
    {blockers.length > 0 && <p role="status" className="break-words rounded-lg bg-rose-500/10 p-3 text-xs text-rose-300">Status locked by {blockers.map(link => link.issueKey).join(", ")}.</p>}
    <div><h5 className="mb-2 text-xs font-medium text-slate-400">Blocked by</h5>{issue.blockedBy?.length ? rows(issue.blockedBy, true) : <p className="text-xs text-slate-500">No blockers linked.</p>}</div>
    <div><h5 className="mb-2 text-xs font-medium text-slate-400">Blocks</h5>{issue.blocks?.length ? rows(issue.blocks, false) : <p className="text-xs text-slate-500">This issue does not block another issue.</p>}</div>
    {canManage && <fieldset disabled={disabled || refreshFailed} className="space-y-3 rounded-xl border border-slate-700 p-4"><legend className="px-2 text-xs">Add dependency</legend><div><label htmlFor="dependency-direction" className="mb-2 block text-xs text-slate-400">Relationship</label><select id="dependency-direction" value={direction} onChange={event => setDirection(event.target.value)} className={field}><option value="BLOCKED_BY">This issue is blocked by</option><option value="BLOCKS">This issue blocks</option></select></div><div><label htmlFor="dependency-target" className="mb-2 block text-xs text-slate-400">Related issue</label><select id="dependency-target" value={targetId} onChange={event => setTargetId(event.target.value)} className={field}><option value="">Choose an issue</option>{issues.filter(item => item.id !== issue.id).map(item => <option key={item.id} value={item.id}>{item.issueKey || `ISSUE-${item.id}`} - {item.title}</option>)}</select></div><button type="button" disabled={!targetId} onClick={() => void mutate(() => api.post(`/projects/${projectId}/issues/${issue.id}/dependencies`, { targetId: Number(targetId), direction }))} className={`${button} text-indigo-300`}>Add dependency link</button></fieldset>}
    {notice && <p role="status" className="text-xs text-indigo-300">{notice}</p>}
    {error && <p role="alert" className="break-words rounded-lg bg-rose-500/10 p-3 text-xs text-rose-300">{error}</p>}
  </section>;
}
