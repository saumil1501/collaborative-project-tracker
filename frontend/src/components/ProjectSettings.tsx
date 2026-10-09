import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Settings, X } from "lucide-react";
import api from "../services/api";

export type ProjectDetails = { id: number; name: string; description: string | null; ownerId: number; createdAt: string; projectKey?: string };
type Member = { userId: number; name: string; email: string; role: string };
type LeaveRequest = { id: number; userId: number; name: string; status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"; requestedAt: string; resolvedAt: string | null };
const field = "w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm";
const button = "rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50";

export default function ProjectSettings({ projectId, currentUserId, onClose, onProjectUpdated, onBack }: {
  projectId: number; currentUserId: number; onClose: () => void;
  onProjectUpdated: (project: ProjectDetails) => void; onBack: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const [project, setProject] = useState<ProjectDetails | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [removeId, setRemoveId] = useState<number | null>(null);
  const [retry, setRetry] = useState(0);
  const isOwner = project?.ownerId === currentUserId;
  const load = useCallback((signal?: AbortSignal, initialize = true) => Promise.all([
    api.get<ProjectDetails>(`/projects/${projectId}`, { signal }),
    api.get<Member[]>(`/projects/${projectId}/members`, { signal }),
    api.get<LeaveRequest[]>(`/projects/${projectId}/leave-requests`, { signal }),
  ]).then(([p, m, r]) => {
    if (signal?.aborted) return;
    setProject(p.data); setMembers(m.data); setRequests(r.data);
    if (initialize) { setName(p.data.name); setDescription(p.data.description || ""); }
    setLoadError("");
  }).catch(() => { if (!signal?.aborted) setLoadError("Couldn't refresh settings. Retry, or return to your projects if access has changed."); })
    .finally(() => { if (!signal?.aborted) setLoading(false); }), [projectId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, retry]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);

  async function mutate(action: "save" | "request" | "cancel" | "approve" | "reject" | "remove", id?: number) {
    if (lock.current || loading || loadError) return;
    if (action === "save" && !name.trim()) { setError("Project name cannot be empty."); return; }
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      if (action === "save") {
        const { data } = await api.put<ProjectDetails>(`/projects/${projectId}`, { name: name.trim(), description: description.trim() });
        setProject(data); setName(data.name); setDescription(data.description || ""); onProjectUpdated(data);
        setNotice("Project details saved.");
      } else {
        if (action === "request") await api.post(`/projects/${projectId}/leave-requests`);
        else if (action === "remove") await api.delete(`/projects/${projectId}/members/${id}`);
        else await api.patch(`/projects/${projectId}/leave-requests/${id}/${action}`);
        setRemoveId(null);
        setNotice({ request: "Request submitted. You keep access until the owner approves.", cancel: "Leave request cancelled.", approve: "Leave approved. The member's issues are now unassigned.", reject: "Request rejected. Access and assignments remain.", remove: "Member removed. Their issues are now unassigned." }[action]);
        await load(undefined, false);
      }
    } catch { setError("Action failed. Your permissions or the request status may have changed. Refresh settings and try again."); }
    finally { lock.current = false; setBusy(false); }
  }
  function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void mutate("save"); }
  const blocked = busy || loading || Boolean(loadError);
  const ownRequest = requests.find(request => request.userId === currentUserId);

  return <dialog ref={dialog} aria-labelledby="settings-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} className="issue-panel fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-full max-w-xl border-l border-slate-700 bg-slate-900 p-0 text-slate-100 shadow-2xl">
    <header className="flex items-center justify-between border-b border-slate-800 p-6"><h2 id="settings-title" className="flex items-center gap-2 text-xl font-semibold"><Settings size={20} className="text-indigo-400" />Project settings</h2><button type="button" disabled={busy} onClick={onClose} aria-label="Close project settings" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 disabled:opacity-50"><X size={20} /></button></header>
    <div className="space-y-7 p-6" aria-busy={loading || busy}>
      {loading && <p role="status" className="text-sm text-slate-400">Loading settings…</p>}
      {loadError && <p role="alert" className="text-sm text-rose-300">{loadError}</p>}
      {(loadError || error) && <button type="button" disabled={busy || loading} onClick={() => { setLoading(true); setRetry(value => value + 1); setError(""); }} className={button}>Refresh settings</button>}
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      <p role="status" className={notice ? "rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-300" : "sr-only"}>{notice}</p>
      {project && <>
        <section aria-label="Project details"><h3 className="mb-4 text-sm font-semibold">Project details</h3><p className="mb-4 text-xs text-slate-400">Permanent project key: <strong className="text-indigo-300">{project.projectKey || `PRJ${project.id}`}</strong></p>{isOwner ? <form onSubmit={save}><fieldset disabled={blocked} className="space-y-4"><div><label htmlFor="settings-name" className="mb-2 block text-xs text-slate-400">Project name</label><input id="settings-name" required maxLength={150} value={name} onChange={event => setName(event.target.value)} className={field} /></div><div><label htmlFor="settings-description" className="mb-2 block text-xs text-slate-400">Description</label><textarea id="settings-description" rows={3} maxLength={1000} value={description} onChange={event => setDescription(event.target.value)} className={field} /></div><button type="submit" className="rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold disabled:opacity-50">Save project details</button></fieldset></form> : <><p className="break-words text-sm">{project.name}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-400">{project.description || "No description"}</p><p className="mt-3 text-xs text-slate-500">Only the owner can edit project details.</p></>}</section>
        <section aria-label="Project members" className="border-t border-slate-800 pt-6"><h3 className="mb-4 text-sm font-semibold">Team members</h3><div className="space-y-3">{members.map(member => <div key={member.userId} className="rounded-xl border border-slate-800 p-3"><div className="flex items-center gap-3"><div className="min-w-0 flex-1"><p className="break-words text-sm">{member.name}{member.userId === currentUserId && " (You)"}</p><p className="mt-1 break-words text-xs text-slate-500">{member.email}</p></div>{member.role === "OWNER" ? <span className="text-xs text-indigo-300">Owner</span> : isOwner && <button type="button" disabled={blocked} onClick={() => setRemoveId(member.userId)} className={button} aria-label={`Remove ${member.name}`}>Remove</button>}</div>{removeId === member.userId && <div className="mt-3 border-t border-slate-800 pt-3"><p className="text-xs leading-5 text-rose-300">Remove {member.name}? Their issues become unassigned. Comments and activity remain.</p><div className="mt-3 flex gap-3"><button type="button" disabled={blocked} onClick={() => void mutate("remove", member.userId)} className="text-xs font-semibold text-rose-400 disabled:opacity-50">Confirm removal</button><button type="button" disabled={busy} onClick={() => setRemoveId(null)} className="text-xs text-slate-400">Keep member</button></div></div>}</div>)}</div></section>
        <section aria-label="Leave requests" className="border-t border-slate-800 pt-6"><h3 className="mb-2 text-sm font-semibold">{isOwner ? "Leave requests" : "Request to leave"}</h3><p className="mb-4 text-xs leading-5 text-slate-500">{isOwner ? "Approval removes membership and unassigns issues. Rejection preserves access and assignments." : "You need the owner's approval to leave. Access and assignments remain while your request is pending or rejected."}</p>{!isOwner && <>{ownRequest && <div className="mb-4 rounded-xl border border-slate-800 p-3"><p className="text-sm">Request status: <span className="font-medium text-indigo-300">{ownRequest.status.toLowerCase()}</span></p><p className="mt-1 text-xs text-slate-500">Submitted {new Date(ownRequest.requestedAt).toLocaleString()}</p></div>}{ownRequest?.status === "PENDING" ? <button type="button" disabled={blocked} onClick={() => void mutate("cancel", ownRequest.id)} className={button}>Cancel leave request</button> : <button type="button" disabled={blocked} onClick={() => void mutate("request")} className={button}>{ownRequest ? "Request to leave again" : "Request permission to leave"}</button>}</>}{isOwner && <>{!requests.length && <p className="text-sm text-slate-500">No leave requests yet.</p>}<div className="space-y-3">{requests.map(request => <article key={request.id} aria-label={`Leave request from ${request.name}`} className="rounded-xl border border-slate-800 p-4"><div className="flex flex-wrap justify-between gap-2"><span className="break-words text-sm font-medium">{request.name}</span><span className={`text-xs ${request.status === "PENDING" ? "text-amber-300" : "text-slate-500"}`}>{request.status.toLowerCase()}</span></div><p className="mt-1 text-xs text-slate-500">{new Date(request.requestedAt).toLocaleString()}</p>{request.status === "PENDING" && <div className="mt-3 flex gap-3"><button type="button" disabled={blocked} onClick={() => void mutate("approve", request.id)} className="rounded-lg bg-indigo-500 px-3 py-2 text-xs font-semibold disabled:opacity-50">Approve leave</button><button type="button" disabled={blocked} onClick={() => void mutate("reject", request.id)} className={button}>Reject leave</button></div>}</article>)}</div><p className="mt-4 text-xs text-slate-500">Owners cannot leave their own project or remove themselves.</p></>}</section>
      </>}
      <button type="button" disabled={busy} onClick={onBack} className="text-xs text-slate-400 underline">Return to all projects</button>
    </div>
  </dialog>;
}
