import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import api from "../services/api";
import type { Issue, Sprint } from "../utils/board";

type Criteria = { q: string; status: string; type: string; priority: string; assignee: string; epicId: string; sprint: string; label: string; overdue: boolean; dueFrom: string; dueTo: string; sort: string };
type Saved = { id: number; name: string; criteria: Partial<Omit<Criteria, "epicId">> & { epicId?: number | null } };
type Results = { items: Issue[]; totalElements: number; totalPages: number; page: number; size: number };
const empty: Criteria = { q: "", status: "", type: "", priority: "", assignee: "", epicId: "", sprint: "", label: "", overdue: false, dueFrom: "", dueTo: "", sort: "created_desc" };
const field = "w-full min-w-0 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm";
const button = "rounded-lg border border-slate-700 px-3 py-2 text-xs hover:bg-slate-800 disabled:opacity-40";
function payload(criteria: Criteria) { return { ...criteria, epicId: criteria.epicId ? Number(criteria.epicId) : null, dueFrom: criteria.dueFrom || null, dueTo: criteria.dueTo || null }; }
function message(error: unknown, fallback: string) { return (error as { response?: { data?: { detail?: string } } }).response?.data?.detail || fallback; }

export default function IssueSearch({ projectId, issues, members, sprints, blocked, onOpen, onBusyChange }: {
  projectId: number; issues: Issue[]; members: { userId: number; name: string }[];
  sprints: Sprint[]; blocked: boolean; onOpen: (issue: Issue) => void; onBusyChange: (busy: boolean) => void;
}) {
  const [draft, setDraft] = useState<Criteria>(empty);
  const [applied, setApplied] = useState({ criteria: empty, page: 0, size: 20 });
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [savedError, setSavedError] = useState("");
  const [savedRetry, setSavedRetry] = useState(0);
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    api.get<Results>(`/projects/${projectId}/issues/search`, { params: { ...payload(applied.criteria), page: applied.page, size: applied.size }, signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) { setResults(data); setError(""); } })
      .catch(error => { if (!controller.signal.aborted) setError(message(error, "We couldn't search issues. Retry with your current filters.")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [projectId, applied, retry, issues]);
  useEffect(() => {
    const controller = new AbortController();
    api.get<Saved[]>(`/projects/${projectId}/saved-filters`, { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) { setSaved(data); setSavedError(""); } })
      .catch(() => { if (!controller.signal.aborted) setSavedError("We couldn't load your saved filters."); })
      .finally(() => { if (!controller.signal.aborted) setSavedLoading(false); });
    return () => controller.abort();
  }, [projectId, savedRetry]);
  const disabled = blocked || saving;
  function change<K extends keyof Criteria>(key: K, value: Criteria[K]) { setDraft(previous => ({ ...previous, [key]: value })); }
  function search(event?: FormEvent) {
    event?.preventDefault(); if (disabled) return;
    if (draft.dueFrom && draft.dueTo && draft.dueFrom > draft.dueTo) { setError("Due date end must be on or after its start."); return; }
    setLoading(true); setApplied({ ...applied, criteria: { ...draft }, page: 0 }); setNotice("");
  }
  function applySaved(id: string) {
    setSelected(id); setConfirmDelete(false);
    const filter = saved.find(item => item.id === Number(id));
    if (!filter) { setName(""); return; }
    const criteria = { ...empty, ...Object.fromEntries(Object.entries(filter.criteria).filter(([, value]) => value != null)), epicId: filter.criteria.epicId?.toString() || "" } as Criteria;
    setDraft(criteria); setName(filter.name); setLoading(true); setApplied({ ...applied, criteria, page: 0 });
  }
  async function save(update: boolean) {
    if (disabled || !name.trim()) return;
    setSaving(true); onBusyChange(true); setSavedError(""); setNotice("");
    try {
      const data = { name: name.trim(), criteria: { ...payload(draft), page: 0, size: 20 } };
      const response = update ? await api.put<Saved>(`/projects/${projectId}/saved-filters/${selected}`, data) : await api.post<Saved>(`/projects/${projectId}/saved-filters`, data);
      setSaved(previous => [...previous.filter(item => item.id !== response.data.id), response.data].sort((a, b) => a.name.localeCompare(b.name)));
      setSelected(String(response.data.id)); setNotice("Personal filter saved.");
    } catch (error) { setSavedError(message(error, "We couldn't save this filter. Your name and criteria are still here.")); }
    finally { setSaving(false); onBusyChange(false); }
  }
  async function remove() {
    if (disabled || !selected) return;
    setSaving(true); onBusyChange(true); setSavedError("");
    try {
      await api.delete(`/projects/${projectId}/saved-filters/${selected}`);
      setSaved(previous => previous.filter(item => item.id !== Number(selected))); setSelected(""); setName(""); setConfirmDelete(false); setNotice("Personal filter deleted. Your current search is unchanged.");
    } catch (error) { setSavedError(message(error, "We couldn't delete this filter. Please try again.")); }
    finally { setSaving(false); onBusyChange(false); }
  }
  function select(key: "status" | "type" | "priority" | "assignee" | "epicId" | "sprint" | "sort", label: string, options: { value: string; label: string }[]) {
    return <div><label htmlFor={`search-${key}`} className="mb-2 block text-xs text-slate-400">{label}</label><select id={`search-${key}`} value={draft[key]} onChange={event => change(key, event.target.value)} className={field}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>;
  }
  return <section aria-label="Advanced issue search" className="space-y-5">
    <div><h3 className="text-lg font-semibold">Find your work</h3><p className="mt-2 text-xs text-slate-400">Combine filters across this project. Saved filters are personal; assigned-to-me and overdue stay current.</p></div>
    <section aria-label="Personal saved filters" className="space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-4">
      <div className="grid gap-3 sm:grid-cols-2"><div><label htmlFor="saved-filter" className="mb-2 block text-xs text-slate-400">Your saved filters</label><select id="saved-filter" disabled={disabled || savedLoading} value={selected} onChange={event => applySaved(event.target.value)} className={field}><option value="">{savedLoading ? "Loading filters..." : "Choose a personal filter"}</option>{saved.map(filter => <option key={filter.id} value={filter.id}>{filter.name}</option>)}</select></div><div><label htmlFor="filter-name" className="mb-2 block text-xs text-slate-400">Filter name</label><input id="filter-name" disabled={disabled} maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="My overdue issues" className={field} /></div></div>
      <p className="text-xs text-slate-500">Save the criteria shown below. Page position is not saved.</p>
      <div className="flex flex-wrap gap-2"><button type="button" disabled={disabled || savedLoading || !name.trim()} onClick={() => void save(false)} className={button}>Save as new filter</button>{selected && <><button type="button" disabled={disabled} onClick={() => void save(true)} className={button}>Update saved filter</button><button type="button" disabled={disabled} onClick={() => setConfirmDelete(true)} className={`${button} text-rose-300`}>Delete saved filter</button></>}</div>
      {confirmDelete && <div className="flex flex-wrap items-center gap-3 text-xs"><span>Delete this personal filter?</span><button disabled={disabled} type="button" onClick={() => void remove()} className={button}>Confirm filter deletion</button><button disabled={disabled} type="button" onClick={() => setConfirmDelete(false)} className={button}>Keep filter</button></div>}
      {savedError && <p role="alert" className="text-sm text-rose-300">{savedError}<button type="button" disabled={disabled || savedLoading} onClick={() => { setSavedLoading(true); setSavedRetry(value => value + 1); }} className="ml-2 underline">Retry saved filters</button></p>}
      {notice && <p role="status" className="text-xs text-indigo-300">{notice}</p>}
    </section>
    <form onSubmit={search} aria-label="Search criteria" className="rounded-xl border border-slate-700 bg-slate-900 p-4"><fieldset disabled={disabled} className="space-y-4">
      <div><label htmlFor="advanced-query" className="mb-2 block text-xs text-slate-400">Text or issue key</label><input id="advanced-query" maxLength={150} value={draft.q} onChange={event => change("q", event.target.value)} placeholder="Title, WEB-12, or label text" className={field} /></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {select("status", "Search status", [{ value: "", label: "All statuses" }, ...["TODO", "IN_PROGRESS", "DONE"].map(value => ({ value, label: value.replaceAll("_", " ").toLowerCase() }))])}
        {select("type", "Search type", [{ value: "", label: "All types" }, ...["EPIC", "STORY", "TASK", "BUG", "SUBTASK"].map(value => ({ value, label: value.toLowerCase() }))])}
        {select("priority", "Search priority", [{ value: "", label: "All priorities" }, ...["HIGH", "MEDIUM", "LOW"].map(value => ({ value, label: value.toLowerCase() }))])}
        {select("assignee", "Search assignee", [{ value: "", label: "All assignees" }, { value: "me", label: "Assigned to me" }, { value: "unassigned", label: "Unassigned" }, ...members.map(member => ({ value: String(member.userId), label: member.name }))])}
        {select("epicId", "Search epic", [{ value: "", label: "All epics" }, ...issues.filter(issue => issue.type === "EPIC").map(issue => ({ value: String(issue.id), label: `${issue.issueKey} - ${issue.title}` }))])}
        {select("sprint", "Search sprint", [{ value: "", label: "All sprint allocations" }, { value: "backlog", label: "Unfinished work outside a sprint" }, ...sprints.filter(sprint => sprint.status !== "COMPLETED").map(sprint => ({ value: String(sprint.id), label: sprint.name }))])}
        <div><label htmlFor="search-label" className="mb-2 block text-xs text-slate-400">Exact label</label><input id="search-label" maxLength={30} pattern="[a-zA-Z0-9][a-zA-Z0-9_-]*" value={draft.label} onChange={event => change("label", event.target.value)} className={field} /></div>
        <div><label htmlFor="search-from" className="mb-2 block text-xs text-slate-400">Due on or after</label><input id="search-from" type="date" value={draft.dueFrom} onChange={event => change("dueFrom", event.target.value)} className={field} /></div>
        <div><label htmlFor="search-to" className="mb-2 block text-xs text-slate-400">Due on or before</label><input id="search-to" type="date" min={draft.dueFrom || undefined} value={draft.dueTo} onChange={event => change("dueTo", event.target.value)} className={field} /></div>
        {select("sort", "Sort search results", [{ value: "created_desc", label: "Newest first" }, { value: "key_asc", label: "Issue number" }, { value: "due_asc", label: "Earliest due date" }, { value: "priority_desc", label: "Highest priority" }])}
      </div>
      <div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.overdue} onChange={event => change("overdue", event.target.checked)} />Overdue only</label><button type="submit" className={`${button} bg-indigo-500/15 text-indigo-300`}>Search issues</button><button type="button" onClick={() => { setDraft(empty); setSelected(""); setName(""); setConfirmDelete(false); setLoading(true); setApplied({ ...applied, criteria: empty, page: 0 }); }} className={button}>Reset search</button></div>
    </fieldset></form>
    {error && <p role="alert" className="rounded-xl bg-rose-500/10 p-4 text-sm text-rose-300">{error}<button type="button" disabled={disabled || loading} onClick={() => { setLoading(true); setRetry(value => value + 1); }} className="ml-2 underline">Retry search</button></p>}
    <section aria-label="Search results" aria-busy={loading} className="rounded-xl border border-slate-700 bg-slate-900 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h4 className="text-sm font-semibold">{loading ? "Searching..." : error ? "Search unavailable" : `${results?.totalElements || 0} matching issues`}</h4><label className="flex items-center gap-2 text-xs text-slate-400">Results per page<select aria-label="Results per page" disabled={disabled || loading} value={applied.size} onChange={event => { setLoading(true); setApplied({ ...applied, size: Number(event.target.value), page: 0 }); }} className="rounded border border-slate-700 bg-slate-800 p-1">{[20, 50, 100].map(size => <option key={size}>{size}</option>)}</select></label></div>
      {!loading && !error && results && <>{!results.items.length && <p className="py-8 text-sm text-slate-400">{results.totalElements ? "This page no longer has results. Go to the previous page or search again." : "No issues match these filters. Adjust or reset your search."}</p>}<ul className="space-y-3">{results.items.map(issue => <li key={issue.id}><button type="button" disabled={disabled} onClick={() => onOpen(issue)} className="block w-full break-words rounded-xl border border-slate-800 bg-slate-800/50 p-4 text-left disabled:opacity-50"><span className="text-[10px] text-indigo-300">{issue.issueKey} · {issue.type || "TASK"}{issue.parentKey && ` · Parent: ${issue.parentKey}`}</span><strong className="mt-2 block text-sm">{issue.title}</strong><span className="mt-2 block text-xs text-slate-400">{issue.status.replaceAll("_", " ").toLowerCase()} · {issue.priority.toLowerCase()} · {issue.assigneeName || "Unassigned"} · {issue.dueDate ? `Due ${issue.dueDate}` : "No due date"}</span></button></li>)}</ul><div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400"><span>{results.totalPages ? `Page ${results.page + 1} of ${results.totalPages}` : "No result pages"}</span><div className="flex gap-2"><button type="button" disabled={disabled || applied.page === 0} onClick={() => { setLoading(true); setApplied({ ...applied, page: Math.max(0, applied.page - 1) }); }} className={button}>Previous page</button><button type="button" disabled={disabled || applied.page + 1 >= results.totalPages} onClick={() => { setLoading(true); setApplied({ ...applied, page: applied.page + 1 }); }} className={button}>Next page</button></div></div></>}
    </section>
  </section>;
}
