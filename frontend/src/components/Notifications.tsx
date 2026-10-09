import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, X } from "lucide-react";
import api from "../services/api";

type Notification = {
  id: number; type: string; message: string; projectId: number | null; issueId: number | null;
  createdAt: string; readAt: string | null;
};
type Inbox = { items: Notification[]; unreadCount: number };
export type NotificationTarget = { projectId: number; issueId: number | null; requestId: number };

export default function Notifications({ onOpen }: { onOpen: (target: Omit<NotificationTarget, "requestId">) => void }) {
  const [inbox, setInbox] = useState<Inbox>({ items: [], unreadCount: 0 });
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const requestVersion = useRef(0);
  const mutationLock = useRef(false);
  const active = useRef(true);
  const refresh = useCallback((signal?: AbortSignal) => {
    if (mutationLock.current) return Promise.resolve();
    const version = ++requestVersion.current;
    return api.get<Inbox>("/notifications", { signal }).then(({ data }) => {
      if (active.current && !signal?.aborted && version === requestVersion.current) { setInbox(data); setError(""); }
    }).catch(() => {
      if (active.current && !signal?.aborted && version === requestVersion.current) setError("We couldn't refresh notifications. Please try again.");
    }).finally(() => {
      if (active.current && !signal?.aborted && version === requestVersion.current) setLoading(false);
    });
  }, []);

  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    void refresh(controller.signal);
    const update = () => { if (document.visibilityState === "visible") void refresh(controller.signal); };
    const timer = window.setInterval(update, 30000);
    window.addEventListener("focus", update);
    return () => { active.current = false; controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", update); };
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    element?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const previous = trigger.current;
    return () => { element?.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, [open, refresh]);

  async function read(item?: Notification, navigate = false) {
    if (mutationLock.current) return;
    mutationLock.current = true; requestVersion.current++; setBusy(true); setError("");
    try {
      if (!item || !item.readAt) {
        await api.patch(item ? `/notifications/${item.id}/read` : "/notifications/read-all");
        if (!active.current) return;
        const now = new Date().toISOString();
        setInbox(previous => ({
          items: previous.items.map(n => !item || n.id === item.id ? { ...n, readAt: n.readAt || now } : n),
          unreadCount: item ? Math.max(0, previous.unreadCount - 1) : 0,
        }));
      }
      if (navigate && item?.projectId != null) {
        setOpen(false); onOpen({ projectId: item.projectId, issueId: item.issueId });
      }
    } catch {
      if (active.current) setError("We couldn't mark notifications as read. Please try again.");
    } finally {
      mutationLock.current = false;
      if (active.current) setBusy(false);
    }
  }

  return <>
    <button ref={trigger} type="button" onClick={() => { setOpen(true); void refresh(); }} aria-label={`Notifications${inbox.unreadCount ? `, ${inbox.unreadCount} unread` : ""}`} className="relative flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white">
      <Bell size={19} /><span className="hidden sm:inline">Notifications</span>
      {inbox.unreadCount > 0 && <span className="rounded-full bg-indigo-500 px-1.5 py-0.5 text-[10px] font-bold text-white" aria-hidden="true">{inbox.unreadCount > 99 ? "99+" : inbox.unreadCount}</span>}
    </button>
    {open && <dialog ref={dialog} aria-labelledby="notifications-title" onCancel={event => { event.preventDefault(); if (!busy) setOpen(false); }} className="issue-panel fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-full max-w-lg border-l border-slate-700 bg-slate-900 p-0 text-slate-100 shadow-2xl">
      <header className="flex items-center justify-between border-b border-slate-800 p-6"><h2 id="notifications-title" className="flex items-center gap-2 text-xl font-semibold"><Bell size={20} />Notifications</h2><button type="button" disabled={busy} onClick={() => setOpen(false)} aria-label="Close notifications" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 disabled:opacity-50"><X size={20} /></button></header>
      <div className="p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-400">{inbox.unreadCount} unread</p><button type="button" disabled={busy || loading || inbox.unreadCount === 0} onClick={() => void read()} className="flex items-center gap-2 text-xs text-indigo-300 disabled:opacity-40"><CheckCheck size={15} />Mark all as read</button></div>
        {loading && <p role="status" className="mb-4 text-sm text-slate-400">Loading notifications…</p>}
        {error && <div role="alert" className="mb-4 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300">{error}<button type="button" disabled={busy} onClick={() => void refresh()} className="ml-2 underline">Retry notifications</button></div>}
        {!loading && !error && !inbox.items.length && <p className="rounded-xl border border-dashed border-slate-700 p-6 text-sm text-slate-400">You're all caught up. New assignments, comments and project updates will appear here.</p>}
        <div className="space-y-3">{inbox.items.map(item => <article key={item.id} aria-label={item.readAt ? "Read notification" : "Unread notification"} className={`rounded-xl border p-4 ${item.readAt ? "border-slate-800 bg-slate-950/30" : "border-indigo-500/30 bg-indigo-500/10"}`}>
          <p className="break-words text-sm leading-6">{!item.readAt && <span aria-hidden="true" className="mr-2 inline-block h-2 w-2 rounded-full bg-indigo-400" />}{item.message}</p>
          <time dateTime={item.createdAt} className="mt-2 block text-xs text-slate-500">{new Date(item.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time>
          <div className="mt-3 flex flex-wrap gap-4">{item.projectId != null ? <button type="button" disabled={busy} onClick={() => void read(item, true)} className="text-xs font-medium text-indigo-300 disabled:opacity-50">{item.issueId != null ? "Open issue" : "Open project settings"}</button> : <span className="text-xs text-slate-500">This project or issue is no longer available to you.</span>}{!item.readAt && <button type="button" disabled={busy} onClick={() => void read(item)} className="text-xs text-slate-400 disabled:opacity-50">Mark as read</button>}</div>
        </article>)}</div>
        <p className="mt-5 text-xs leading-5 text-slate-500">Showing your latest 50 notifications. Updates refresh every 30 seconds.</p>
      </div>
    </dialog>}
  </>;
}
