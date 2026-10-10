import { childProgress, isPlannable } from "../utils/board";
import type { Issue, IssueType } from "../utils/board";

const button = "rounded-lg border border-slate-700 px-3 py-2 text-xs text-indigo-300 hover:bg-slate-800 disabled:opacity-50";

export default function IssueHierarchy({ issues, canManage, blocked, onOpen, onCreate }: {
  issues: Issue[]; canManage: boolean; blocked: boolean;
  onOpen: (issue: Issue) => void; onCreate: (type: IssueType, parentId?: number) => void;
}) {
  const epics = issues.filter(issue => issue.type === "EPIC");
  function row(issue: Issue) {
    const progress = childProgress(issue.id, issues);
    return <li key={issue.id} className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/30 p-3">
      <button type="button" disabled={blocked} onClick={() => onOpen(issue)} className="block w-full break-words text-left disabled:opacity-50">
        <span className="text-[10px] text-indigo-300">{issue.issueKey || `ISSUE-${issue.id}`} · {issue.type || "TASK"}</span>
        <strong className="mt-1 block text-sm">{issue.title}</strong>
        <span className="mt-1 block text-xs text-slate-400">{issue.status.replaceAll("_", " ").toLowerCase()} · {issue.assigneeName || "Unassigned"}{issue.storyPoints != null && ` · ${issue.storyPoints} points`}</span>
      </button>
      {isPlannable(issue) && <>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-slate-400">{progress.done}/{progress.total} subtasks done</span>{canManage && <button type="button" disabled={blocked || issue.status === "DONE"} className={button} onClick={() => onCreate("SUBTASK", issue.id)}>Add subtask to {issue.issueKey || `ISSUE-${issue.id}`}</button>}</div>
        {progress.total > 0 && <ul aria-label={`Subtasks of ${issue.issueKey || issue.id}`} className="mt-3 space-y-2 border-l border-slate-700 pl-3">{issues.filter(child => child.parentId === issue.id).map(row)}</ul>}
      </>}
    </li>;
  }
  return <section aria-label="Epic hierarchy" className="mb-6 space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><h3 className="text-lg font-semibold">Epics & subtasks</h3><p className="mt-2 text-xs text-slate-400">Break larger goals into issues and smaller steps. Progress counts direct children once.</p></div>{canManage && <button type="button" disabled={blocked} className={button} onClick={() => onCreate("EPIC")}>Create epic</button>}</div>
    {!epics.length && <p className="rounded-xl border border-dashed border-slate-700 p-5 text-sm text-slate-400">No epics yet. Group related stories, tasks and bugs under a shared goal.</p>}
    {epics.map(epic => {
      const progress = childProgress(epic.id, issues);
      return <section key={epic.id} aria-label={`Epic ${epic.title}`} className="min-w-0 rounded-xl border border-slate-700 bg-slate-900 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><button type="button" disabled={blocked} onClick={() => onOpen(epic)} className="min-w-0 flex-1 break-words text-left"><span className="text-xs text-indigo-300">{epic.issueKey} · EPIC · {epic.status.replaceAll("_", " ").toLowerCase()}</span><h4 className="mt-2 text-lg font-semibold">{epic.title}</h4><p className="mt-2 whitespace-pre-wrap text-xs text-slate-400">{epic.description || "No description yet."}</p></button>{canManage && <button type="button" disabled={blocked || epic.status === "DONE"} className={button} onClick={() => onCreate("STORY", epic.id)}>Add issue to {epic.issueKey || `ISSUE-${epic.id}`}</button>}</div>
        <div className="my-4"><div className="mb-2 flex flex-wrap justify-between gap-2 text-xs text-slate-400"><span>{progress.done}/{progress.total} issues done · {progress.percent}%</span><span>{progress.completedPoints}/{progress.points} estimated points completed</span></div><div role="progressbar" aria-label={`Progress for ${epic.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} className="h-2 overflow-hidden rounded-full bg-slate-800"><div style={{ width: `${progress.percent}%` }} className="h-full rounded-full bg-indigo-400" /></div></div>
        {progress.total ? <ul className="space-y-3">{issues.filter(issue => issue.parentId === epic.id).map(row)}</ul> : <p className="text-xs text-slate-400">No issues linked to this epic. Add a new issue or choose this epic in an existing issue's details.</p>}
      </section>;
    })}
    <section aria-label="Issues without an epic" className="rounded-xl border border-slate-700 bg-slate-900 p-4 sm:p-5"><h4 className="mb-4 font-semibold">Issues without an epic</h4>{issues.some(issue => isPlannable(issue) && !issue.parentId) ? <ul className="space-y-3">{issues.filter(issue => isPlannable(issue) && !issue.parentId).map(row)}</ul> : <p className="text-xs text-slate-400">All issues are grouped, or no issues have been created yet.</p>}</section>
  </section>;
}
