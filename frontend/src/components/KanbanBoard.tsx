import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft, CalendarDays, Check, Circle, CircleCheck, Clock3, GripVertical, Plus, Search, Settings, Trash2, X } from "lucide-react";
import api from "../services/api";
import IssueComments from "./IssueComments";
import IssueActivity from "./IssueActivity";
import ProjectSettings from "./ProjectSettings";
import SprintPlanning from "./SprintPlanning";
import IssueHierarchy from "./IssueHierarchy";
import type { ProjectDetails } from "./ProjectSettings";
import { canChangeIssueStatus, canManageIssues, filterIssues, initials, isOverdue, summarizeIssues, childProgress } from "../utils/board";
import type { Issue, Priority, Status, Sprint, IssueType } from "../utils/board";

type Member = { userId: number; name: string; email: string; role: string };
const columns = [
  { status: "TODO" as const, label: "To do", color: "bg-slate-400", icon: Circle },
  { status: "IN_PROGRESS" as const, label: "In progress", color: "bg-indigo-400", icon: Clock3 },
  { status: "DONE" as const, label: "Done", color: "bg-emerald-400", icon: CircleCheck },
];
const priorityColors = { LOW: "bg-slate-700/70 text-slate-300", MEDIUM: "bg-amber-400/10 text-amber-300", HIGH: "bg-rose-400/10 text-rose-300" };
const fieldClass = "w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2.5 text-sm text-slate-100";

export default function KanbanBoard({ projectId, projectName, currentUserId, onBack, onProjectUpdated, initialIssueId, initialSettings = false }: {
  projectId: number; projectName: string; currentUserId: number; onBack: () => void;
  onProjectUpdated: (project: ProjectDetails) => void;
  initialIssueId?: number | null; initialSettings?: boolean;
}) {
  const [showSettings, setShowSettings] = useState(initialSettings);
  const openedInitialIssue = useRef(false);
  const [view, setView] = useState<"all" | "backlog" | "sprint" | "epics">("all");
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [planningLoading, setPlanningLoading] = useState(true);
  const [planningError, setPlanningError] = useState("");
  const [planningBusy, setPlanningBusy] = useState(false);
  const [selectedSprintId, setSelectedSprintId] = useState<number | null>(null);
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
  const panelBusy = saving || commentsBusy || planningBusy || pendingId !== null;
  const [editorError, setEditorError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [issueType, setIssueType] = useState<IssueType>("TASK");
  const [parentId, setParentId] = useState("");
  const [storyPoints, setStoryPoints] = useState("");
  const [labels, setLabels] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const currentMemberRole = members.find(member => member.userId === currentUserId)?.role;
  const canEditIssues = canManageIssues(currentMemberRole);
  const canChangeStatus = (issue: Issue) => canChangeIssueStatus(issue, currentUserId, currentMemberRole);
  const filtersActive = Boolean(query || assigneeFilter || priorityFilter || mineOnly || typeFilter);

  const loadBoard = useCallback((signal?: AbortSignal, throwOnError = false) => {
    return Promise.all([
      api.get<Issue[]>(`/projects/${projectId}/issues`, { signal }),
      api.get<Member[]>(`/projects/${projectId}/members`, { signal }),
    ]).then(([issueResponse, memberResponse]) => {
      if (signal?.aborted) return;
      setIssues(issueResponse.data);
      setMembers(memberResponse.data);
      setError("");
      if (initialIssueId && !openedInitialIssue.current) {
        openedInitialIssue.current = true;
        const issue = issueResponse.data.find(item => item.id === initialIssueId);
        if (issue) {
          setParentId(issue.parentId?.toString() || "");
          setIssueType(issue.type || "TASK"); setStoryPoints(issue.storyPoints?.toString() || ""); setLabels((issue.labels || []).join(", "));
          setTitle(issue.title); setDescription(issue.description || ""); setPriority(issue.priority);
          setAssigneeId(issue.assigneeId?.toString() || ""); setDueDate(issue.dueDate || "");
          setEditor({ issue });
        } else setError("This issue is no longer available. It may have been deleted.");
      }
    }).catch(() => {
      if (!signal?.aborted) setError("We couldn't load this board. Please try again.");
      if (throwOnError) throw new Error("Issue refresh failed");
    }).finally(() => {
      if (!signal?.aborted) setLoading(false);
    });
  }, [projectId, initialIssueId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadBoard(controller.signal);
    return () => controller.abort();
  }, [loadBoard]);

  useEffect(() => {
    const controller = new AbortController();
    api.get<Sprint[]>(`/projects/${projectId}/sprints`, { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) { setSprints(data); setPlanningError(""); } })
      .catch(() => { if (!controller.signal.aborted) setPlanningError("We couldn't load sprint planning. Your issue board is still available."); })
      .finally(() => { if (!controller.signal.aborted) setPlanningLoading(false); });
    return () => controller.abort();
  }, [projectId]);

  async function refreshPlanning() {
    setPlanningLoading(true);
    try {
      const [{ data }] = await Promise.all([api.get<Sprint[]>(`/projects/${projectId}/sprints`), loadBoard(undefined, true)]);
      setSprints(data); setPlanningError("");
    } catch (error) { setPlanningError("We couldn't refresh sprint planning. Please reload planning."); throw error; }
    finally { setPlanningLoading(false); }
  }

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

  function openEditor(issue: Issue | null, defaults?: { type: IssueType; parentId?: number }) {
    if (planningBusy || mutationLock.current || (!issue && !canEditIssues)) return;
    setIssueType(issue?.type || defaults?.type || "TASK");
    setParentId((issue?.parentId ?? defaults?.parentId)?.toString() || "");
    setStoryPoints(issue?.storyPoints?.toString() || "");
    setLabels((issue?.labels || []).join(", "));
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
    if (!canEditIssues || commentsBusy || planningBusy) return;
    if (!title.trim()) { setEditorError("Give your issue a title."); return; }
    const issueLabels = labels.split(",").map(label => label.trim()).filter(Boolean);
    if (issueLabels.length > 10 || issueLabels.some(label => !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,29}$/.test(label))) {
      setEditorError("Use up to 10 labels, each 1–30 letters, digits, hyphens or underscores."); return;
    }
    if (issueType === "SUBTASK" && !parentId) { setEditorError("Choose a parent story, task or bug for this subtask."); return; }
    if (mutationLock.current) return;
    mutationLock.current = true;
    setSaving(true);
    setEditorError("");
    const payload = { title: title.trim(), description: description.trim(), priority, assigneeId: assigneeId ? Number(assigneeId) : null, dueDate: dueDate || null, type: issueType, storyPoints: storyPoints ? Number(storyPoints) : null, labels: issueLabels, parentId: parentId ? Number(parentId) : null };
    try {
      const { data } = editor?.issue
        ? await api.put<Issue>(`/projects/${projectId}/issues/${editor.issue.id}`, payload)
        : await api.post<Issue>(`/projects/${projectId}/issues`, payload);
      setIssues(previous => editor?.issue ? previous.map(issue => issue.id === data.id ? data : issue) : [data, ...previous]);
      setNotice(editor?.issue ? "Issue updated." : issueType === "EPIC" ? "Epic created." : issueType === "SUBTASK" ? "Subtask created under its parent." : "Issue created in the backlog.");
      setEditor(null);
    } catch (error) {
      const reason = (error as { response?: { data?: { message?: string; detail?: string } } }).response?.data?.detail || (error as { response?: { data?: { message?: string } } }).response?.data?.message;
      setEditorError(reason || "We couldn't save your issue. Your changes are still here; please try again.");
    } finally {
      mutationLock.current = false;
      setSaving(false);
    }
  }

  async function changeStatus(issue: Issue, status: Status) {
    if (planningBusy || !canChangeStatus(issue) || issue.status === status || mutationLock.current) return;
    mutationLock.current = true;
    setPendingId(issue.id);
    setError("");
    setIssues(previous => previous.map(item => item.id === issue.id ? { ...item, status } : item));
    try {
      const { data } = await api.patch<Issue>(`/projects/${projectId}/issues/${issue.id}/status`, { status });
      setIssues(previous => previous.map(item => item.id === issue.id ? data : item));
      setEditor(previous => previous?.issue?.id === data.id ? { issue: data } : previous);
      setNotice(`Issue moved to ${columns.find(column => column.status === status)?.label}.`);
    } catch (error) {
      setIssues(previous => previous.map(item => item.id === issue.id ? issue : item));
      const reason = (error as { response?: { data?: { message?: string; detail?: string } } }).response?.data?.detail || (error as { response?: { data?: { message?: string } } }).response?.data?.message;
      setError(reason || "We couldn't save that move. The issue has been returned to its previous column.");
    } finally {
      mutationLock.current = false;
      setPendingId(null);
    }
  }

  async function deleteIssue() {
    if (!canEditIssues || !editor?.issue || mutationLock.current || commentsBusy) return;
    mutationLock.current = true;
    setSaving(true);
    setEditorError("");
    try {
      await api.delete(`/projects/${projectId}/issues/${editor.issue.id}`);
      setIssues(previous => previous.filter(issue => issue.id !== editor.issue?.id));
      setEditor(null);
      setNotice("Issue deleted.");
    } catch (error) {
      const reason = (error as { response?: { data?: { message?: string; detail?: string } } }).response?.data?.detail || (error as { response?: { data?: { message?: string } } }).response?.data?.message;
      setEditorError(reason || "We couldn't delete this issue. Please try again.");
    } finally {
      mutationLock.current = false;
      setSaving(false);
    }
  }

  const focusedSprint = sprints.find(sprint => sprint.id === selectedSprintId && sprint.status !== "COMPLETED")
    || sprints.find(sprint => sprint.status === "ACTIVE") || sprints.find(sprint => sprint.status === "PLANNED");
  const scopedIssues = view === "sprint" ? issues.filter(issue => Boolean(focusedSprint) && issue.type !== "EPIC" && issue.sprintId === focusedSprint?.id) : issues;
  const filteredIssues = filterIssues(scopedIssues, { query, priority: priorityFilter, assignee: assigneeFilter, mineOnly, currentUserId });
  const visibleIssues = filteredIssues.filter(issue => !typeFilter || (issue.type || "TASK") === typeFilter);
  const summary = summarizeIssues(scopedIssues);

  return (
    <section className="mt-8" aria-label={`${projectName} board`}>
      <button onClick={onBack} disabled={pendingId !== null || planningBusy} className="mb-6 flex items-center gap-2 text-sm text-slate-400 hover:text-white disabled:opacity-50"><ArrowLeft size={16} /> All projects</button>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0"><p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-400">Project workspace</p><h2 className="break-words text-3xl font-semibold tracking-tight sm:text-4xl">{projectName}</h2><p className="mt-2 text-sm text-slate-400">A little clarity. A lot of progress.</p></div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => setShowSettings(true)} disabled={loading || pendingId !== null || planningBusy} className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-50"><Settings size={17} /> Project settings</button>
          {canEditIssues && <button onClick={() => openEditor(null)} disabled={loading || Boolean(error && !issues.length) || pendingId !== null || planningBusy} className="flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold shadow-lg shadow-indigo-500/15 hover:bg-indigo-400 disabled:opacity-50"><Plus size={17} /> New issue</button>}
        </div>
      </div>

      <nav aria-label="Project views" className="mb-6 flex flex-wrap gap-2 border-b border-slate-800 pb-4">{([{ id: "all", label: "All issues" }, { id: "backlog", label: "Backlog" }, { id: "sprint", label: "Sprint board" }, { id: "epics", label: "Epics" }] as const).map(tab => <button key={tab.id} type="button" disabled={planningBusy || panelBusy || pendingId !== null} aria-pressed={view === tab.id} onClick={() => setView(tab.id)} className={`rounded-lg px-4 py-2 text-sm disabled:opacity-50 ${view === tab.id ? "bg-indigo-500/15 text-indigo-300" : "text-slate-400 hover:bg-slate-800"}`}>{tab.label}</button>)}</nav>
      {(view === "backlog" || view === "sprint") && planningLoading && <p role="status" className="mb-5 text-sm text-slate-400">Loading sprint planning...</p>}
      {(view === "backlog" || view === "sprint") && planningError && <div role="alert" className="mb-5 rounded-lg bg-rose-500/10 p-3 text-sm text-rose-300">{planningError}<button disabled={planningBusy} type="button" onClick={() => void refreshPlanning().catch(() => {})} className="ml-2 underline">Reload planning</button></div>}
      {(view === "backlog" || view === "sprint") && !planningError && <SprintPlanning projectId={projectId} issues={issues} sprints={sprints} canManage={canEditIssues} blocked={loading || planningLoading || Boolean(error) || panelBusy || pendingId !== null} compact={view === "sprint"} focusedSprint={focusedSprint} onSelect={setSelectedSprintId} onOpenIssue={openEditor} onChanged={refreshPlanning} onCompleted={() => setView("backlog")} onBusyChange={setPlanningBusy} />}
      {view === "epics" && loading && <p role="status" className="mb-5 text-sm text-slate-400">Loading issue hierarchy...</p>}
      {view === "epics" && !loading && <IssueHierarchy issues={issues} canManage={canEditIssues} blocked={loading || panelBusy || Boolean(error)} onOpen={openEditor} onCreate={(type, parentId) => openEditor(null, { type, parentId })} />}
      {(view === "backlog" || view === "epics") && error && <div role="alert" className="mb-5 rounded-lg bg-rose-500/10 p-3 text-sm text-rose-300">{error}<button type="button" disabled={planningBusy || loading} onClick={() => { setLoading(true); void loadBoard(); }} className="ml-2 underline">Reload board</button></div>}
      {(view === "all" || view === "sprint") && <>
      <div className="mb-6 grid grid-cols-3 gap-2 sm:gap-4" aria-label="Board summary">
        {[{ label: "Total issues", value: summary.total, color: "text-white" }, { label: "Completed", value: summary.completed, color: "text-emerald-400" }, { label: "Overdue", value: summary.overdue, color: "text-rose-400" }].map(stat => <div key={stat.label} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3 sm:p-5"><p className="text-xs text-slate-400 sm:text-sm">{stat.label}</p><p className={`mt-2 text-2xl font-semibold ${stat.color}`}>{loading ? "—" : stat.value}</p></div>)}
      </div>

      <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-3 sm:p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-0 flex-[2_1_220px]"><Search size={17} className="absolute left-3 top-3 text-slate-500" /><input aria-label="Search issue titles" placeholder="Search issues…" value={query} onChange={event => setQuery(event.target.value)} className={`${fieldClass} pl-10`} /></div>
          <select aria-label="Filter by assignee" value={assigneeFilter} onChange={event => setAssigneeFilter(event.target.value)} className={`${fieldClass} min-w-0 flex-[1_1_150px]`}><option value="">All assignees</option><option value="unassigned">Unassigned</option>{members.map(member => <option key={member.userId} value={member.userId}>{member.name}</option>)}</select>
          <select aria-label="Filter by issue type" value={typeFilter} onChange={event => setTypeFilter(event.target.value)} className={`${fieldClass} min-w-0 flex-[1_1_130px]`}><option value="">All types</option><option value="BUG">Bug</option><option value="TASK">Task</option><option value="STORY">Story</option><option value="EPIC">Epic</option><option value="SUBTASK">Subtask</option></select>
          <select aria-label="Filter by priority" value={priorityFilter} onChange={event => setPriorityFilter(event.target.value)} className={`${fieldClass} min-w-0 flex-[1_1_130px]`}><option value="">All priorities</option><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option></select>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><button aria-pressed={mineOnly} onClick={() => setMineOnly(!mineOnly)} className={`rounded-lg border px-3 py-1.5 text-xs transition ${mineOnly ? "border-indigo-500/50 bg-indigo-500/15 text-indigo-300" : "border-slate-700 text-slate-400 hover:text-white"}`}>Assigned to me</button><div className="flex items-center gap-3 text-xs text-slate-500"><span>{loading ? "Loading issues…" : `${visibleIssues.length} of ${scopedIssues.length} issues`}</span>{filtersActive && <button onClick={() => { setQuery(""); setAssigneeFilter(""); setPriorityFilter(""); setMineOnly(false); setTypeFilter(""); }} className="text-indigo-300 hover:text-indigo-200">Clear filters</button>}</div></div>
      </div>

      {error && <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300"><span>{error}</span><button disabled={pendingId !== null || loading} onClick={() => { setLoading(true); void loadBoard(); }} className="font-semibold underline">Reload board</button></div>}
      <div role="status" aria-live="polite" className={notice ? "mb-5 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-300" : "sr-only"}>{notice && <Check size={16} />}{notice}</div>

      <div className="grid items-start gap-4 lg:grid-cols-3" aria-busy={loading}>
        {columns.map(column => {
          const columnIssues = visibleIssues.filter(issue => issue.status === column.status);
          const Icon = column.icon;
          return <section key={column.status} aria-label={column.label} onDragOver={event => { if (draggingId !== null && pendingId === null && issues.some(issue => issue.id === draggingId && canChangeStatus(issue))) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropTarget(column.status); } }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null); }} onDrop={event => { event.preventDefault(); const issue = issues.find(item => item.id === draggingId); setDraggingId(null); setDropTarget(null); if (issue) void changeStatus(issue, column.status); }} className={`min-h-64 rounded-2xl border p-3 transition-colors sm:p-4 ${dropTarget === column.status ? "border-indigo-400 bg-indigo-500/10" : "border-slate-800 bg-slate-900/50"}`}>
            <div className="mb-5 flex items-center gap-2.5"><span className={`h-2 w-2 rounded-full ${column.color}`} /><h3 className="text-sm font-semibold">{column.label}</h3><span className="rounded-md bg-slate-800 px-2 py-0.5 text-xs text-slate-400">{loading ? "—" : columnIssues.length}</span>{canEditIssues && <button disabled={loading || pendingId !== null || Boolean(error && !issues.length)} onClick={() => openEditor(null)} aria-label={`Create an issue (starts in To do)`} className="ml-auto rounded-lg p-1 text-slate-500 hover:bg-slate-800 hover:text-white disabled:opacity-40"><Plus size={17} /></button>}</div>
            <div className="space-y-3">
              {loading ? [0, 1].map(item => <div key={item} className="animate-pulse rounded-xl border border-slate-700/60 bg-slate-800/60 p-4" aria-hidden="true"><div className="mb-4 h-3 w-16 rounded bg-slate-700" /><div className="mb-2 h-4 w-4/5 rounded bg-slate-700" /><div className="mb-6 h-3 w-3/5 rounded bg-slate-700" /><div className="h-7 w-full rounded bg-slate-700" /></div>) : columnIssues.map(issue => <article key={issue.id} draggable={canChangeStatus(issue) && pendingId === null && !planningBusy} onDragStart={event => { if (!canChangeStatus(issue)) { event.preventDefault(); return; } setDraggingId(issue.id); event.dataTransfer.setData("text/plain", String(issue.id)); event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => { setDraggingId(null); setDropTarget(null); }} className={`group rounded-xl border border-slate-700/70 bg-slate-800/80 p-4 shadow-sm transition hover:border-slate-600 ${draggingId === issue.id ? "opacity-40" : ""} ${pendingId === issue.id ? "animate-pulse" : ""}`}>
                <div className="mb-3 flex items-center justify-between"><span className="text-[11px] font-medium tracking-wide text-slate-500">{issue.issueKey || `ISSUE-${issue.id}`}</span>{canChangeStatus(issue) && <GripVertical size={15} aria-hidden="true" className="cursor-grab text-slate-600 group-hover:text-slate-400" />}</div>
                <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] text-indigo-300"><span className="rounded bg-slate-800 px-2 py-1">{issue.type || "TASK"}</span>{issue.parentKey && <span>Parent: {issue.parentKey}</span>}{childProgress(issue.id, issues).total > 0 && <span>{childProgress(issue.id, issues).done}/{childProgress(issue.id, issues).total} children done</span>}{issue.storyPoints != null && <span>{issue.storyPoints} points</span>}</div>
                <button onClick={() => openEditor(issue)} disabled={pendingId !== null || planningBusy} className="block w-full text-left disabled:opacity-60"><h4 className="break-words text-sm font-semibold leading-6 text-slate-100 group-hover:text-indigo-200">{issue.title}</h4><p className="mt-1.5 line-clamp-2 break-words text-xs leading-5 text-slate-400">{issue.description || "Add a description to bring this issue into focus."}</p></button>
                <div className="my-4 flex flex-wrap items-center gap-2"><span className={`rounded-md px-2 py-1 text-[11px] font-medium ${priorityColors[issue.priority]}`}>{issue.priority.charAt(0) + issue.priority.slice(1).toLowerCase()} priority</span>{issue.dueDate && <span className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] ${isOverdue(issue) ? "bg-rose-500/10 text-rose-300" : "bg-slate-700/50 text-slate-400"}`}><CalendarDays size={12} />{new Date(`${issue.dueDate}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}{isOverdue(issue) && " · Overdue"}</span>}</div>
                {Boolean(issue.labels?.length) && <div className="flex flex-wrap gap-1">{issue.labels?.map(label => <span key={label} className="max-w-full break-all rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-300">{label}</span>)}</div>}
                <div className="flex items-center gap-2 border-t border-slate-700/60 pt-3"><span title={issue.assigneeName || "Unassigned"} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-indigo-400/20 bg-indigo-400/10 text-[10px] font-semibold text-indigo-300">{initials(issue.assigneeName)}</span><span className="min-w-0 flex-1 truncate text-xs text-slate-400">{issue.assigneeName || "Unassigned"}</span><select aria-label={`Status for ${issue.title}`} disabled={!canChangeStatus(issue) || pendingId !== null || planningBusy} title={canChangeStatus(issue) ? "Change status" : "Only the project owner or current assignee can change status"} value={issue.status} onChange={event => void changeStatus(issue, event.target.value as Status)} className="max-w-32 rounded-lg border border-slate-700 bg-slate-900 px-1.5 py-1 text-[11px] text-slate-300 disabled:opacity-50">{columns.map(option => <option key={option.status} value={option.status}>{option.label}</option>)}</select></div>
              </article>)}
              {!loading && !columnIssues.length && <div className="rounded-xl border border-dashed border-slate-700/70 px-4 py-10 text-center"><Icon size={24} className="mx-auto mb-3 text-slate-600" /><p className="text-sm text-slate-400">{filtersActive ? "No matching issues" : "Room for what's next"}</p><p className="mt-2 text-xs leading-5 text-slate-500">{filtersActive ? "Try changing or clearing your filters." : column.status === "TODO" ? view === "sprint" ? "Add issues to this sprint from the Backlog view." : "Create an issue to get started." : `Move an issue here when it's ${column.status === "DONE" ? "complete" : "underway"}.`}</p></div>}
            </div>
          </section>;
        })}
      </div>
      <p className="mt-4 text-xs text-slate-500">Owners and current assignees can change status using drag and drop or the status menu. Only the owner can create, edit other details or delete issues. Members can join the discussion.</p>

      </>}
      {showSettings && <ProjectSettings projectId={projectId} currentUserId={currentUserId} onProjectUpdated={onProjectUpdated} onBack={onBack} onClose={() => { setShowSettings(false); setLoading(true); void loadBoard(); }} />}

      {editor && <dialog ref={dialog} aria-labelledby="issue-panel-title" onCancel={event => { event.preventDefault(); if (!panelBusy) setEditor(null); }} onClick={event => { if (event.target === event.currentTarget && !panelBusy) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setEditor(null); } }} className="issue-panel fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-full max-w-lg border-l border-slate-700 bg-slate-900 p-0 text-slate-100 shadow-2xl">
        <form onSubmit={saveIssue} className="flex min-h-full flex-col">
          <header className="flex items-center justify-between border-b border-slate-800 p-6"><div><p className="mb-1 text-xs text-indigo-400">{editor.issue ? (editor.issue.issueKey || `ISSUE-${editor.issue.id}`) : "Make the next step clear"}</p><h3 id="issue-panel-title" className="text-xl font-semibold">{editor.issue ? "Issue details" : "New issue"}</h3></div><button type="button" disabled={panelBusy} onClick={() => setEditor(null)} aria-label="Close issue details" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-50"><X size={20} /></button></header>
          {editor.issue && <a className="mx-6 mt-4 text-xs text-indigo-300 underline" href={`#project=${projectId}&issue=${editor.issue.id}`} target="_blank" rel="noopener noreferrer">Open issue link</a>}
          {!canEditIssues && <p className="mx-6 mt-5 text-sm text-slate-400">Only the project owner can change issue details. You can discuss this issue below.</p>}
          <fieldset disabled={panelBusy || !canEditIssues} className="flex-1 space-y-6 p-6 disabled:opacity-60">
            <div><label htmlFor="issue-title" className="mb-2 block text-sm font-medium">Title <span className="text-indigo-400">*</span></label><input ref={titleInput} id="issue-title" required maxLength={150} placeholder="What needs to happen?" value={title} onChange={event => setTitle(event.target.value)} className={fieldClass} /></div>
            <div><label htmlFor="issue-description" className="mb-2 block text-sm font-medium">Description</label><textarea id="issue-description" rows={7} maxLength={2000} placeholder="Add context, a checklist, or what success looks like…" value={description} onChange={event => setDescription(event.target.value)} className={`${fieldClass} resize-y`} /></div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2"><div><label htmlFor="issue-priority" className="mb-2 block text-sm font-medium">Priority</label><select id="issue-priority" value={priority} onChange={event => setPriority(event.target.value as Priority)} className={fieldClass}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></select></div><div><label htmlFor="issue-assignee" className="mb-2 block text-sm font-medium">Assignee</label><select id="issue-assignee" value={assigneeId} onChange={event => setAssigneeId(event.target.value)} className={fieldClass}><option value="">Unassigned</option>{members.map(member => <option key={member.userId} value={member.userId}>{member.name}</option>)}</select></div></div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2"><div><label htmlFor="issue-type" className="mb-2 block text-sm font-medium">Issue type</label><select id="issue-type" value={issueType} disabled={Boolean(editor.issue && (editor.issue.type === "EPIC" || editor.issue.type === "SUBTASK"))} onChange={event => { const type = event.target.value as IssueType; setIssueType(type); if (type === "EPIC" || type === "SUBTASK" || issueType === "EPIC" || issueType === "SUBTASK") setParentId(""); if (type === "EPIC" || type === "SUBTASK") setStoryPoints(""); }} className={fieldClass}><option value="TASK">Task</option><option value="BUG">Bug</option><option value="STORY">Story</option>{(!editor.issue || editor.issue.type === "EPIC") && <option value="EPIC">Epic</option>}{(!editor.issue || editor.issue.type === "SUBTASK") && <option value="SUBTASK">Subtask</option>}</select></div><div><label htmlFor="issue-points" className="mb-2 block text-sm font-medium">Story points</label><select id="issue-points" disabled={issueType === "EPIC" || issueType === "SUBTASK"} value={storyPoints} onChange={event => setStoryPoints(event.target.value)} className={fieldClass}><option value="">Not estimated</option>{[1, 2, 3, 5, 8, 13].map(value => <option key={value} value={value}>{value}</option>)}</select></div></div>
            {issueType !== "EPIC" && <div><label htmlFor="issue-parent" className="mb-2 block text-sm font-medium">{issueType === "SUBTASK" ? "Parent issue" : "Epic"}</label><select id="issue-parent" required={issueType === "SUBTASK"} value={parentId} onChange={event => setParentId(event.target.value)} className={fieldClass}><option value="">{issueType === "SUBTASK" ? "Choose a parent" : "No epic"}</option>{issues.filter(issue => issue.id !== editor.issue?.id && (issueType === "SUBTASK" ? issue.type !== "EPIC" && issue.type !== "SUBTASK" : issue.type === "EPIC")).map(issue => <option key={issue.id} value={issue.id}>{issue.issueKey || `ISSUE-${issue.id}`} - {issue.title}</option>)}</select><p className="mt-2 text-xs text-slate-400">{issueType === "SUBTASK" ? "Subtasks inherit their parent's sprint. Estimate the parent issue." : "Group this issue under a larger goal. Reopen a completed epic before adding unfinished work."}</p></div>}
            <div><label htmlFor="issue-labels" className="mb-2 block text-sm font-medium">Labels</label><input id="issue-labels" value={labels} maxLength={320} onChange={event => setLabels(event.target.value)} placeholder="frontend, authentication" className={fieldClass} /><p className="mt-2 text-xs text-slate-400">Comma-separated. Up to 10 labels; letters, digits, hyphens and underscores.</p></div>
            <div><label htmlFor="issue-due" className="mb-2 block text-sm font-medium">Due date</label><input id="issue-due" type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} className={fieldClass} /><p className="mt-2 text-xs text-slate-500">Optional. Unfinished issues past this date are marked overdue.</p></div>
            {editor.issue && <div className="rounded-xl border border-slate-800 p-4 text-xs text-slate-400"><p>Status: <span className="text-slate-200">{columns.find(column => column.status === editor.issue?.status)?.label}</span></p><p className="mt-2">Created {new Date(editor.issue.createdAt).toLocaleDateString()}</p></div>}
          </fieldset>
          {editor.issue && <section aria-label="Issue relationships" className="mx-6 mb-6 space-y-3 rounded-xl border border-slate-700 p-4">
            <label className="block text-xs text-slate-400" htmlFor="detail-status">Issue status</label><select id="detail-status" value={editor.issue.status} disabled={panelBusy || !canChangeStatus(editor.issue)} onChange={event => void changeStatus(editor.issue!, event.target.value as Status)} className={fieldClass}>{columns.map(column => <option key={column.status} value={column.status}>{column.label}</option>)}</select>
            {error && <p role="alert" className="break-words text-xs text-rose-300">{error}</p>}
            {editor.issue.parentId && <button type="button" disabled={panelBusy} onClick={() => { const parent = issues.find(issue => issue.id === editor.issue?.parentId); if (parent) openEditor(parent); }} className="block text-left text-xs text-indigo-300 underline">Open parent {editor.issue.parentKey}</button>}
            {editor.issue.type !== "SUBTASK" && <><p className="text-xs text-slate-300">{childProgress(editor.issue.id, issues).done}/{childProgress(editor.issue.id, issues).total} {editor.issue.type === "EPIC" ? "issues" : "subtasks"} completed</p>{issues.filter(issue => issue.parentId === editor.issue?.id).map(issue => <button key={issue.id} type="button" disabled={panelBusy} onClick={() => openEditor(issue)} className="block w-full break-words rounded-lg bg-slate-800 p-3 text-left text-xs"><span className="text-indigo-300">{issue.issueKey}</span> - {issue.title} ({issue.status.toLowerCase().replaceAll("_", " ")})</button>)}{canEditIssues && <button type="button" disabled={panelBusy || editor.issue.status === "DONE"} onClick={() => openEditor(null, { type: editor.issue?.type === "EPIC" ? "STORY" : "SUBTASK", parentId: editor.issue!.id })} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-indigo-300">{editor.issue.type === "EPIC" ? "Add issue to epic" : "Add subtask"}</button>}</>}
          </section>}
          {editor.issue && <IssueComments key={`comments-${editor.issue.id}`} projectId={projectId} issueId={editor.issue.id} currentUserId={currentUserId} disabled={saving || planningBusy || pendingId !== null || confirmDelete} onBusyChange={setCommentsBusy} />}
          {editor.issue && <IssueActivity key={`activity-${editor.issue.id}-${editor.issue.status}`} projectId={projectId} issueId={editor.issue.id} />}
          {editorError && <p role="alert" className="mx-6 mb-4 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300">{editorError}</p>}
          {confirmDelete && <div className="mx-6 mb-5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4"><p className="text-sm font-medium text-rose-200">Delete this issue permanently?</p><p className="mt-1 text-xs text-rose-300/80">This action cannot be undone.</p><div className="mt-3 flex gap-3"><button type="button" disabled={panelBusy} onClick={() => void deleteIssue()} className="rounded-lg bg-rose-500 px-3 py-2 text-xs font-semibold disabled:opacity-50">{saving ? "Deleting…" : "Yes, delete issue"}</button><button type="button" disabled={panelBusy} onClick={() => setConfirmDelete(false)} className="text-xs text-slate-300">Keep issue</button></div></div>}
          <footer className="sticky bottom-0 flex items-center gap-3 border-t border-slate-800 bg-slate-900 p-6">{canEditIssues && editor.issue && <button type="button" disabled={panelBusy} onClick={() => setConfirmDelete(true)} aria-label="Delete issue" className="mr-auto rounded-lg p-2 text-rose-400 hover:bg-rose-500/10 disabled:opacity-50"><Trash2 size={18} /></button>}<button type="button" disabled={panelBusy} onClick={() => setEditor(null)} className="ml-auto rounded-xl px-3 py-2.5 text-sm text-slate-400 hover:text-white disabled:opacity-50">{canEditIssues ? "Cancel" : "Close"}</button>{canEditIssues && <button type="submit" disabled={panelBusy || confirmDelete} className="rounded-xl bg-indigo-500 px-5 py-2.5 text-sm font-semibold hover:bg-indigo-400 disabled:opacity-50">{saving ? "Saving…" : editor.issue ? "Save changes" : "Create issue"}</button>}</footer>
        </form>
    
      </dialog>}
    </section>
  );
}
