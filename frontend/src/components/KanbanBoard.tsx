import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft, CalendarDays, Check, Circle, CircleCheck, Clock3, GripVertical, Plus, Search, Settings, Trash2, X } from "lucide-react";
import api from "../services/api";
import IssueComments from "./IssueComments";
import IssueActivity from "./IssueActivity";
import ProjectSettings from "./ProjectSettings";
import type { ProjectDetails } from "./ProjectSettings";
import { canChangeIssueStatus, filterIssues, initials, isOverdue, summarizeIssues } from "../utils/board";
import type { Issue, Priority, Status } from "../utils/board";

type Member = { userId: number; name: string; email: string; role: string };
const columns = [
  { status: "TODO" as const, label: "To do", color: "bg-slate-400", icon: Circle },
  { status: "IN_PROGRESS" as const, label: "In progress", color: "bg-indigo-400", icon: Clock3 },
  { status: "DONE" as const, label: "Done", color: "bg-emerald-400", icon: CircleCheck },
];
const priorityColors = { LOW: "bg-slate-700/70 text-slate-300", MEDIUM: "bg-amber-400/10 text-amber-300", HIGH: "bg-rose-400/10 text-rose-300" };
const fieldClass = "w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2.5 text-sm text-slate-100";

export default function KanbanBoard({ projectId, projectName, currentUserId, onBack, onProjectUpdated }: {
  projectId: number; projectName: string; currentUserId: number; onBack: () => void;
  onProjectUpdated: (project: ProjectDetails) => void;
}) {
  const [showSettings, setShowSettings] = useState(false);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<Status | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const mutationLock = useRef(false);
  const [editor, setEditor] = useState<{ issue: Issue | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [commentsBusy, setCommentsBusy] = useState(false);
  const panelBusy = saving || commentsBusy;
  const [editorError, setEditorError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const filtersActive = Boolean(query || assigneeFilter || priorityFilter || mineOnly);
  const currentMemberRole = members.find(member => member.userId === currentUserId)?.role;
  const canChangeStatus = (issue: Issue) => canChangeIssueStatus(issue, currentUserId, currentMemberRole);

  const loadBoard = useCallback((signal?: AbortSignal) => {
    return Promise.all([
      api.get<Issue[]>(`/projects/${projectId}/issues`, { signal }),
      api.get<Member[]>(`/projects/${projectId}/members`, { signal }),
    ]).then(([issueResponse, memberResponse]) => {
      if (signal?.aborted) return;
      setIssues(issueResponse.data);
      setMembers(memberResponse.data);
      setError("");
    }).catch(() => {
      if (!signal?.aborted) setError("We couldn't load this board. Please try again.");
    }).finally(() => {
      if (!signal?.aborted) setLoading(false);
    });
  }, [projectId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadBoard(controller.signal);
    return () => controller.abort();
  }, [loadBoard]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!editor) return;
    const element = dialog.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    element?.showModal();
    titleInput.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [editor]);

  function openEditor(issue: Issue | null) {
    if (mutationLock.current) return;
    setTitle(issue?.title ?? "");
    setDescription(issue?.description ?? "");
    setPriority(issue?.priority ?? "MEDIUM");
    setAssigneeId(issue?.assigneeId?.toString() ?? "");
    setDueDate(issue?.dueDate ?? "");
    setEditorError("");
    setConfirmDelete(false);
    setEditor({ issue });
  }

  async function saveIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (commentsBusy) return;
    if (!title.trim()) { setEditorError("Give your issue a title."); return; }
    if (mutationLock.current) return;
    mutationLock.current = true;
    setSaving(true);
    setEditorError("");
    const payload = { title: title.trim(), description: description.trim(), priority, assigneeId: assigneeId ? Number(assigneeId) : null, dueDate: dueDate || null };
    try {
      const { data } = editor?.issue
        ? await api.put<Issue>(`/projects/${projectId}/issues/${editor.issue.id}`, payload)
        : await api.post<Issue>(`/projects/${projectId}/issues`, payload);
      setIssues(previous => editor?.issue ? previous.map(issue => issue.id === data.id ? data : issue) : [data, ...previous]);
      setNotice(editor?.issue ? "Issue updated." : "Issue created. Let's get it moving!");
      setEditor(null);
    } catch {
      setEditorError("We couldn't save your issue. Your changes are still here; please try again.");
    } finally {
      mutationLock.current = false;
      setSaving(false);
    }
  }

  async function changeStatus(issue: Issue, status: Status) {
    if (!canChangeStatus(issue) || issue.status === status || mutationLock.current) return;
    mutationLock.current = true;
    setPendingId(issue.id);
    setError("");
    setIssues(previous => previous.map(item => item.id === issue.id ? { ...item, status } : item));
    try {
      const { data } = await api.patch<Issue>(`/projects/${projectId}/issues/${issue.id}/status`, { status });
      setIssues(previous => previous.map(item => item.id === issue.id ? data : item));
      setNotice(`Issue moved to ${columns.find(column => column.status === status)?.label}.`);
    } catch {
      setIssues(previous => previous.map(item => item.id === issue.id ? issue : item));
      setError("We couldn't save that move. The issue has been returned to its previous column.");
    } finally {
      mutationLock.current = false;
      setPendingId(null);
    }
  }

  async function deleteIssue() {
    if (!editor?.issue || mutationLock.current || commentsBusy) return;
    mutationLock.current = true;
    setSaving(true);
    setEditorError("");
    try {
      await api.delete(`/projects/${projectId}/issues/${editor.issue.id}`);
      setIssues(previous => previous.filter(issue => issue.id !== editor.issue?.id));
      setEditor(null);
      setNotice("Issue deleted.");
    } catch {
      setEditorError("We couldn't delete this issue. Please try again.");
    } finally {
      mutationLock.current = false;
      setSaving(false);
    }
  }

  const visibleIssues = filterIssues(issues, { query, priority: priorityFilter, assignee: assigneeFilter, mineOnly, currentUserId });
  const summary = summarizeIssues(issues);

  return (
    <section className="mt-8" aria-label={`${projectName} board`}>
      <button onClick={onBack} disabled={pendingId !== null} className="mb-6 flex items-center gap-2 text-sm text-slate-400 hover:text-white disabled:opacity-50"><ArrowLeft size={16} /> All projects</button>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0"><p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-400">Project workspace</p><h2 className="break-words text-3xl font-semibold tracking-tight sm:text-4xl">{projectName}</h2><p className="mt-2 text-sm text-slate-400">A little clarity. A lot of progress.</p></div>
        <div className="flex flex-wrap gap-2"><button onClick={() => setShowSettings(true)} disabled={pendingId !== null} className="flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"><Settings size={17} />Project settings</button><button onClick={() => openEditor(null)} disabled={loading || Boolean(error && !issues.length) || pendingId !== null} className="flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold shadow-lg shadow-indigo-500/15 hover:bg-indigo-400 disabled:opacity-50"><Plus size={17} /> New issue</button></div>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-2 sm:gap-4" aria-label="Board summary">
        {[{ label: "Total issues", value: summary.total, color: "text-white" }, { label: "Completed", value: summary.completed, color: "text-emerald-400" }, { label: "Overdue", value: summary.overdue, color: "text-rose-400" }].map(stat => <div key={stat.label} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3 sm:p-5"><p className="text-xs text-slate-400 sm:text-sm">{stat.label}</p><p className={`mt-2 text-2xl font-semibold ${stat.color}`}>{loading ? "—" : stat.value}</p></div>)}
      </div>

      <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-3 sm:p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-0 flex-[2_1_220px]"><Search size={17} className="absolute left-3 top-3 text-slate-500" /><input aria-label="Search issue titles" placeholder="Search issues…" value={query} onChange={event => setQuery(event.target.value)} className={`${fieldClass} pl-10`} /></div>
          <select aria-label="Filter by assignee" value={assigneeFilter} onChange={event => setAssigneeFilter(event.target.value)} className={`${fieldClass} min-w-0 flex-[1_1_150px]`}><option value="">All assignees</option><option value="unassigned">Unassigned</option>{members.map(member => <option key={member.userId} value={member.userId}>{member.name}</option>)}</select>
          <select aria-label="Filter by priority" value={priorityFilter} onChange={event => setPriorityFilter(event.target.value)} className={`${fieldClass} min-w-0 flex-[1_1_130px]`}><option value="">All priorities</option><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option></select>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><button aria-pressed={mineOnly} onClick={() => setMineOnly(!mineOnly)} className={`rounded-lg border px-3 py-1.5 text-xs transition ${mineOnly ? "border-indigo-500/50 bg-indigo-500/15 text-indigo-300" : "border-slate-700 text-slate-400 hover:text-white"}`}>Assigned to me</button><div className="flex items-center gap-3 text-xs text-slate-500"><span>{loading ? "Loading issues…" : `${visibleIssues.length} of ${issues.length} issues`}</span>{filtersActive && <button onClick={() => { setQuery(""); setAssigneeFilter(""); setPriorityFilter(""); setMineOnly(false); }} className="text-indigo-300 hover:text-indigo-200">Clear filters</button>}</div></div>
      </div>

      {error && <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300"><span>{error}</span><button disabled={pendingId !== null || loading} onClick={() => { setLoading(true); void loadBoard(); }} className="font-semibold underline">Reload board</button></div>}
      <div role="status" aria-live="polite" className={notice ? "mb-5 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-300" : "sr-only"}>{notice && <Check size={16} />}{notice}</div>

      <div className="grid items-start gap-4 lg:grid-cols-3" aria-busy={loading}>
        {columns.map(column => {
          const columnIssues = visibleIssues.filter(issue => issue.status === column.status);
          const Icon = column.icon;
          return <section key={column.status} aria-label={column.label} onDragOver={event => { if (draggingId !== null && pendingId === null && issues.some(issue => issue.id === draggingId && canChangeStatus(issue))) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropTarget(column.status); } }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null); }} onDrop={event => { event.preventDefault(); const issue = issues.find(item => item.id === draggingId); setDraggingId(null); setDropTarget(null); if (issue) void changeStatus(issue, column.status); }} className={`min-h-64 rounded-2xl border p-3 transition-colors sm:p-4 ${dropTarget === column.status ? "border-indigo-400 bg-indigo-500/10" : "border-slate-800 bg-slate-900/50"}`}>
            <div className="mb-5 flex items-center gap-2.5"><span className={`h-2 w-2 rounded-full ${column.color}`} /><h3 className="text-sm font-semibold">{column.label}</h3><span className="rounded-md bg-slate-800 px-2 py-0.5 text-xs text-slate-400">{loading ? "—" : columnIssues.length}</span><button disabled={loading || pendingId !== null || Boolean(error && !issues.length)} onClick={() => openEditor(null)} aria-label={`Create an issue (starts in To do)`} className="ml-auto rounded-lg p-1 text-slate-500 hover:bg-slate-800 hover:text-white disabled:opacity-40"><Plus size={17} /></button></div>
            <div className="space-y-3">
              {loading ? [0, 1].map(item => <div key={item} className="animate-pulse rounded-xl border border-slate-700/60 bg-slate-800/60 p-4" aria-hidden="true"><div className="mb-4 h-3 w-16 rounded bg-slate-700" /><div className="mb-2 h-4 w-4/5 rounded bg-slate-700" /><div className="mb-6 h-3 w-3/5 rounded bg-slate-700" /><div className="h-7 w-full rounded bg-slate-700" /></div>) : columnIssues.map(issue => <article key={issue.id} draggable={pendingId === null && canChangeStatus(issue)} onDragStart={event => { if (!canChangeStatus(issue)) { event.preventDefault(); return; } setDraggingId(issue.id); event.dataTransfer.setData("text/plain", String(issue.id)); event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => { setDraggingId(null); setDropTarget(null); }} className={`group rounded-xl border border-slate-700/70 bg-slate-800/80 p-4 shadow-sm transition hover:border-slate-600 ${draggingId === issue.id ? "opacity-40" : ""} ${pendingId === issue.id ? "animate-pulse" : ""}`}>
                <div className="mb-3 flex items-center justify-between"><span className="text-[11px] font-medium tracking-wide text-slate-500">ISSUE-{issue.id}</span>{canChangeStatus(issue) && <GripVertical size={15} aria-hidden="true" className="cursor-grab text-slate-600 group-hover:text-slate-400" />}</div>
                <button onClick={() => openEditor(issue)} disabled={pendingId !== null} className="block w-full text-left disabled:opacity-60"><h4 className="break-words text-sm font-semibold leading-6 text-slate-100 group-hover:text-indigo-200">{issue.title}</h4><p className="mt-1.5 line-clamp-2 break-words text-xs leading-5 text-slate-400">{issue.description || "Add a description to bring this issue into focus."}</p></button>
                <div className="my-4 flex flex-wrap items-center gap-2"><span className={`rounded-md px-2 py-1 text-[11px] font-medium ${priorityColors[issue.priority]}`}>{issue.priority.charAt(0) + issue.priority.slice(1).toLowerCase()} priority</span>{issue.dueDate && <span className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] ${isOverdue(issue) ? "bg-rose-500/10 text-rose-300" : "bg-slate-700/50 text-slate-400"}`}><CalendarDays size={12} />{new Date(`${issue.dueDate}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}{isOverdue(issue) && " · Overdue"}</span>}</div>
                <div className="flex items-center gap-2 border-t border-slate-700/60 pt-3"><span title={issue.assigneeName || "Unassigned"} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-indigo-400/20 bg-indigo-400/10 text-[10px] font-semibold text-indigo-300">{initials(issue.assigneeName)}</span><span className="min-w-0 flex-1 truncate text-xs text-slate-400">{issue.assigneeName || "Unassigned"}</span><select aria-label={`Status for ${issue.title}`} disabled={pendingId !== null || !canChangeStatus(issue)} title={canChangeStatus(issue) ? "Change status" : "Only the project owner or current assignee can change status"} value={issue.status} onChange={event => void changeStatus(issue, event.target.value as Status)} className="max-w-32 rounded-lg border border-slate-700 bg-slate-900 px-1.5 py-1 text-[11px] text-slate-300 disabled:opacity-50">{columns.map(option => <option key={option.status} value={option.status}>{option.label}</option>)}</select></div>
              </article>)}
              {!loading && !columnIssues.length && <div className="rounded-xl border border-dashed border-slate-700/70 px-4 py-10 text-center"><Icon size={24} className="mx-auto mb-3 text-slate-600" /><p className="text-sm text-slate-400">{filtersActive ? "No matching issues" : "Room for what's next"}</p><p className="mt-2 text-xs leading-5 text-slate-500">{filtersActive ? "Try changing or clearing your filters." : column.status === "TODO" ? "Create an issue to get started." : `Move an issue here when it's ${column.status === "DONE" ? "complete" : "underway"}.`}</p></div>}
            </div>
          </section>;
        })}
      </div>
      <p className="mt-4 text-xs text-slate-500">Only the project owner or current assignee can change an issue's status, using drag and drop or its status menu. Select an issue to view and edit its details.</p>
      {showSettings && <ProjectSettings projectId={projectId} currentUserId={currentUserId} onProjectUpdated={onProjectUpdated} onBack={onBack} onClose={() => { setShowSettings(false); void loadBoard(); }} />}

      {editor && <dialog ref={dialog} aria-labelledby="issue-panel-title" onCancel={event => { event.preventDefault(); if (!panelBusy) setEditor(null); }} onClick={event => { if (event.target === event.currentTarget && !panelBusy) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setEditor(null); } }} className="issue-panel fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-full max-w-lg border-l border-slate-700 bg-slate-900 p-0 text-slate-100 shadow-2xl">
        <form onSubmit={saveIssue} className="flex min-h-full flex-col">
          <header className="flex items-center justify-between border-b border-slate-800 p-6"><div><p className="mb-1 text-xs text-indigo-400">{editor.issue ? `ISSUE-${editor.issue.id}` : "Make the next step clear"}</p><h3 id="issue-panel-title" className="text-xl font-semibold">{editor.issue ? "Issue details" : "New issue"}</h3></div><button type="button" disabled={panelBusy} onClick={() => setEditor(null)} aria-label="Close issue details" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-50"><X size={20} /></button></header>
          <fieldset disabled={panelBusy} className="flex-1 space-y-6 p-6 disabled:opacity-60">
            <div><label htmlFor="issue-title" className="mb-2 block text-sm font-medium">Title <span className="text-indigo-400">*</span></label><input ref={titleInput} id="issue-title" required maxLength={150} placeholder="What needs to happen?" value={title} onChange={event => setTitle(event.target.value)} className={fieldClass} /></div>
            <div><label htmlFor="issue-description" className="mb-2 block text-sm font-medium">Description</label><textarea id="issue-description" rows={7} maxLength={2000} placeholder="Add context, a checklist, or what success looks like…" value={description} onChange={event => setDescription(event.target.value)} className={`${fieldClass} resize-y`} /></div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2"><div><label htmlFor="issue-priority" className="mb-2 block text-sm font-medium">Priority</label><select id="issue-priority" value={priority} onChange={event => setPriority(event.target.value as Priority)} className={fieldClass}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></select></div><div><label htmlFor="issue-assignee" className="mb-2 block text-sm font-medium">Assignee</label><select id="issue-assignee" value={assigneeId} onChange={event => setAssigneeId(event.target.value)} className={fieldClass}><option value="">Unassigned</option>{members.map(member => <option key={member.userId} value={member.userId}>{member.name}</option>)}</select></div></div>
            <div><label htmlFor="issue-due" className="mb-2 block text-sm font-medium">Due date</label><input id="issue-due" type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} className={fieldClass} /><p className="mt-2 text-xs text-slate-500">Optional. Unfinished issues past this date are marked overdue.</p></div>
            {editor.issue && <div className="rounded-xl border border-slate-800 p-4 text-xs text-slate-400"><p>Status: <span className="text-slate-200">{columns.find(column => column.status === editor.issue?.status)?.label}</span></p><p className="mt-2">Created {new Date(editor.issue.createdAt).toLocaleDateString()}</p></div>}
          </fieldset>
          {editor.issue && <IssueComments key={editor.issue.id} projectId={projectId} issueId={editor.issue.id} currentUserId={currentUserId} disabled={saving || confirmDelete} onBusyChange={setCommentsBusy} />}
          {editor.issue && <IssueActivity key={editor.issue.id} projectId={projectId} issueId={editor.issue.id} />}
          {editorError && <p role="alert" className="mx-6 mb-4 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300">{editorError}</p>}
          {confirmDelete && <div className="mx-6 mb-5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4"><p className="text-sm font-medium text-rose-200">Delete this issue permanently?</p><p className="mt-1 text-xs text-rose-300/80">This action cannot be undone.</p><div className="mt-3 flex gap-3"><button type="button" disabled={panelBusy} onClick={() => void deleteIssue()} className="rounded-lg bg-rose-500 px-3 py-2 text-xs font-semibold disabled:opacity-50">{saving ? "Deleting…" : "Yes, delete issue"}</button><button type="button" disabled={panelBusy} onClick={() => setConfirmDelete(false)} className="text-xs text-slate-300">Keep issue</button></div></div>}
          <footer className="sticky bottom-0 flex items-center gap-3 border-t border-slate-800 bg-slate-900 p-6">{editor.issue && <button type="button" disabled={panelBusy} onClick={() => setConfirmDelete(true)} aria-label="Delete issue" className="mr-auto rounded-lg p-2 text-rose-400 hover:bg-rose-500/10 disabled:opacity-50"><Trash2 size={18} /></button>}<button type="button" disabled={panelBusy} onClick={() => setEditor(null)} className="ml-auto rounded-xl px-3 py-2.5 text-sm text-slate-400 hover:text-white disabled:opacity-50">Cancel</button><button type="submit" disabled={panelBusy || confirmDelete} className="rounded-xl bg-indigo-500 px-5 py-2.5 text-sm font-semibold hover:bg-indigo-400 disabled:opacity-50">{saving ? "Saving…" : editor.issue ? "Save changes" : "Create issue"}</button></footer>
        </form>
      </dialog>}
    </section>
  );
}
