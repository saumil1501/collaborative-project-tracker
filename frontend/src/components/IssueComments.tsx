import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, Pencil, Trash2 } from "lucide-react";
import api from "../services/api";
import { initials } from "../utils/board";

type Comment = {
  id: number; authorId: number; authorName: string; body: string;
  createdAt: string; editedAt: string | null;
};
const textareaClass = "w-full resize-y rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100";

export default function IssueComments({ projectId, issueId, currentUserId, disabled, onBusyChange }: {
  projectId: number; issueId: number; currentUserId: number; disabled: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const active = useRef(true);
  const baseUrl = `/projects/${projectId}/issues/${issueId}/comments`;
  const blocked = disabled || busy;

  const loadComments = useCallback((signal?: AbortSignal) =>
    api.get<Comment[]>(baseUrl, { signal })
      .then(({ data }) => { if (!signal?.aborted) { setComments(data); setLoadError(""); } })
      .catch(() => { if (!signal?.aborted) setLoadError("We couldn't load the discussion. Try again."); })
      .finally(() => { if (!signal?.aborted) setLoading(false); }), [baseUrl]);

  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    void loadComments(controller.signal);
    return () => { active.current = false; controller.abort(); };
  }, [loadComments]);

  async function mutate(action: "create" | "edit" | "delete", commentId?: number) {
    if (lock.current || disabled) return;
    const body = (action === "edit" ? editDraft : draft).trim();
    if (action !== "delete" && (!body || body.length > 2000)) {
      setError("Write a comment between 1 and 2,000 characters.");
      return;
    }
    lock.current = true;
    setBusy(true);
    onBusyChange(true);
    setError("");
    setNotice("");
    try {
      if (action === "delete") {
        await api.delete(`${baseUrl}/${commentId}`);
        if (!active.current) return;
        setComments(previous => previous.filter(comment => comment.id !== commentId));
        setDeleteId(null);
        if (editingId === commentId) setEditingId(null);
        setNotice("Comment deleted.");
      } else {
        const { data } = action === "edit"
          ? await api.put<Comment>(`${baseUrl}/${commentId}`, { body })
          : await api.post<Comment>(baseUrl, { body });
        if (!active.current) return;
        setComments(previous => action === "edit"
          ? previous.map(comment => comment.id === commentId ? data : comment)
          : [...previous, data]);
        if (action === "edit") setEditingId(null); else setDraft("");
        setNotice(action === "edit" ? "Comment updated." : "Comment added.");
      }
    } catch {
      if (active.current) setError(action === "delete"
        ? "We couldn't delete this comment. Please try again."
        : "We couldn't save your comment. Your text is still here; please try again.");
    } finally {
      lock.current = false;
      if (active.current) { setBusy(false); onBusyChange(false); }
    }
  }

  return <section aria-labelledby="discussion-title" className="mx-6 mb-6 border-t border-slate-800 pt-6" aria-busy={loading || busy}>
    <h4 id="discussion-title" className="mb-5 flex items-center gap-2 text-sm font-semibold"><MessageSquare size={17} className="text-indigo-400" />Discussion <span className="text-xs font-normal text-slate-500">{loading ? "" : comments.length}</span></h4>
    {loading && <p role="status" className="mb-4 text-sm text-slate-400">Loading comments…</p>}
    {loadError && <div role="alert" className="mb-4 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300">{loadError}<button type="button" disabled={blocked || loading} onClick={() => { setLoading(true); void loadComments(); }} className="ml-2 underline">Retry</button></div>}
    {!loading && !loadError && !comments.length && <p className="mb-5 text-sm text-slate-500">Start the conversation. Share an update or ask a question.</p>}
    <div className="space-y-5">
      {comments.map(comment => <article key={comment.id} aria-label={`Comment by ${comment.authorName}`} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        <div className="mb-3 flex items-start gap-2.5"><span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500/10 text-xs font-semibold text-indigo-300">{initials(comment.authorName)}</span><div className="min-w-0 flex-1"><p className="break-words text-xs font-semibold text-slate-200">{comment.authorName}{comment.authorId === currentUserId && <span className="ml-2 font-normal text-slate-500">You</span>}</p><p className="mt-1 text-[11px] text-slate-500"><time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time>{comment.editedAt && <span title={`Edited ${new Date(comment.editedAt).toLocaleString()}`}> · edited</span>}</p></div>
          {comment.authorId === currentUserId && <div className="flex gap-1"><button type="button" aria-label={`Edit comment by ${comment.authorName}`} disabled={blocked || editingId !== null} onClick={() => { setEditingId(comment.id); setEditDraft(comment.body); setDeleteId(null); setError(""); setNotice(""); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-white disabled:opacity-40"><Pencil size={14} /></button><button type="button" aria-label={`Delete comment by ${comment.authorName}`} disabled={blocked || editingId !== null} onClick={() => { setDeleteId(comment.id); setError(""); setNotice(""); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-40"><Trash2 size={14} /></button></div>}
        </div>
        {editingId === comment.id ? <div><label htmlFor="edit-comment" className="sr-only">Edit comment</label><textarea id="edit-comment" autoFocus rows={4} maxLength={2000} disabled={blocked} value={editDraft} onChange={event => setEditDraft(event.target.value)} className={textareaClass} /><div className="mt-2 flex items-center gap-3"><button type="button" disabled={blocked || !editDraft.trim()} onClick={() => void mutate("edit", comment.id)} className="rounded-lg bg-indigo-500 px-3 py-2 text-xs font-semibold disabled:opacity-50">{busy ? "Saving…" : "Save comment"}</button><button type="button" disabled={blocked} onClick={() => { setEditingId(null); setError(""); }} className="text-xs text-slate-400">Cancel edit</button></div></div> : <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">{comment.body}</p>}
        {deleteId === comment.id && <div className="mt-3 border-t border-slate-800 pt-3"><p className="text-xs text-rose-300">Delete this comment permanently?</p><div className="mt-2 flex gap-3"><button type="button" disabled={blocked} onClick={() => void mutate("delete", comment.id)} className="text-xs font-semibold text-rose-400 disabled:opacity-50">{busy ? "Deleting…" : "Confirm delete"}</button><button type="button" disabled={blocked} onClick={() => setDeleteId(null)} className="text-xs text-slate-400">Keep comment</button></div></div>}
      </article>)}
    </div>
    {error && <p role="alert" className="mt-4 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}
    <p role="status" aria-live="polite" className={notice ? "mt-3 text-xs text-emerald-300" : "sr-only"}>{notice}</p>
    <div className="mt-5"><label htmlFor="new-comment" className="mb-2 block text-sm font-medium">Add a comment</label><textarea id="new-comment" rows={3} maxLength={2000} placeholder="Share your thoughts…" value={draft} disabled={blocked || loading || Boolean(loadError)} onChange={event => setDraft(event.target.value)} className={textareaClass} /><div className="mt-2 flex items-center justify-between gap-3"><span className="text-xs text-slate-500">{draft.length}/2,000 · Plain text</span><button type="button" disabled={blocked || loading || Boolean(loadError) || !draft.trim() || editingId !== null || deleteId !== null} onClick={() => void mutate("create")} className="rounded-xl bg-indigo-500 px-4 py-2 text-xs font-semibold hover:bg-indigo-400 disabled:opacity-50">{busy && editingId === null && deleteId === null ? "Posting…" : "Post comment"}</button></div></div>
  </section>;
}
