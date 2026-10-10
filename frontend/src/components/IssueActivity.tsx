import { useCallback, useEffect, useState } from "react";
import { History } from "lucide-react";
import { initials } from "../utils/board";
import api from "../services/api";

type Activity = {
  id: number; actorId: number; actorName: string;
  field: "CREATED" | "TITLE" | "DESCRIPTION" | "STATUS" | "PRIORITY" | "ASSIGNEE" | "DUE_DATE" | "TYPE" | "STORY_POINTS" | "LABELS" | "SPRINT" | "PARENT";
  oldValue: string | null; newValue: string | null; createdAt: string;
};
const labels = { CREATED: "created this issue", TITLE: "changed the title", DESCRIPTION: "changed the description", STATUS: "changed the status", PRIORITY: "changed the priority", ASSIGNEE: "changed the assignee", DUE_DATE: "changed the due date", TYPE: "changed the issue type", STORY_POINTS: "changed story points", LABELS: "changed labels", SPRINT: "changed sprint planning", PARENT: "changed the parent issue" };
const values: Record<string, string> = { TODO: "To do", IN_PROGRESS: "In progress", DONE: "Done", LOW: "Low", MEDIUM: "Medium", HIGH: "High" };

function displayValue(value: string | null, field: Activity["field"]) {
  if (value === null || value === "") return field === "ASSIGNEE" ? "Unassigned" : "Not set";
  if (field === "STATUS" || field === "PRIORITY") return values[value] || value;
  return value;
}

export default function IssueActivity({ projectId, issueId }: { projectId: number; issueId: number }) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loadActivity = useCallback((signal: AbortSignal) => api.get<Activity[]>(
    `/projects/${projectId}/issues/${issueId}/activity`, { signal },
  ).then(({ data }) => {
    if (!signal.aborted) { setActivities(data); setError(""); }
  }).catch(() => {
    if (!signal.aborted) setError("We couldn't load the activity history. Please try again.");
  }).finally(() => { if (!signal.aborted) setLoading(false); }), [projectId, issueId]);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void loadActivity(controller.signal);
    return () => controller.abort();
  }, [loadActivity, retry]);

  return <section aria-labelledby="activity-title" aria-busy={loading} className="mx-6 mb-6 border-t border-slate-800 pt-6">
    <div className="mb-2 flex items-center justify-between gap-3"><h4 id="activity-title" className="flex items-center gap-2 text-sm font-semibold"><History size={17} className="text-indigo-400" />Activity history</h4><span className="text-[11px] text-slate-500">Newest first</span></div>
    <p className="mb-5 text-xs leading-5 text-slate-500">Changes recorded since activity tracking was added. Earlier changes aren't included.</p>
    {loading && <p role="status" className="text-sm text-slate-400">Loading activity…</p>}
    {error && <div role="alert" className="rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300">{error}<button type="button" disabled={loading} onClick={() => { setLoading(true); setRetry(value => value + 1); }} className="ml-2 underline">Retry activity</button></div>}
    {!loading && !error && !activities.length && <p className="rounded-xl border border-dashed border-slate-800 p-4 text-sm leading-6 text-slate-500">No activity recorded yet. Future changes to this issue will appear here.</p>}
    {!loading && !error && <ol className="space-y-5">
      {activities.map(activity => <li key={activity.id} className="relative border-l border-slate-700 pl-5">
        <span aria-hidden="true" className="absolute -left-3 top-0 flex h-6 w-6 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-[9px] font-semibold text-indigo-300">{initials(activity.actorName)}</span>
        <p className="break-words text-xs leading-5 text-slate-400"><span className="font-semibold text-slate-200">{activity.actorName}</span> {labels[activity.field]}.</p>
        <time dateTime={activity.createdAt} className="mt-1 block text-[11px] text-slate-500">{new Date(activity.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time>
        {activity.field === "CREATED" ? <p className="mt-2 whitespace-pre-wrap break-words text-xs text-slate-300">{activity.newValue}</p> : <details className="mt-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3" open={activity.field !== "DESCRIPTION"}>
          <summary className="cursor-pointer text-[11px] font-medium text-indigo-300">Previous and new values</summary>
          <dl className="mt-3 space-y-3 text-xs"><div><dt className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Previous</dt><dd className="whitespace-pre-wrap break-words text-slate-400">{displayValue(activity.oldValue, activity.field)}</dd></div><div><dt className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">New</dt><dd className="whitespace-pre-wrap break-words text-slate-200">{displayValue(activity.newValue, activity.field)}</dd></div></dl>
        </details>}
      </li>)}
    </ol>}
  </section>;
}
