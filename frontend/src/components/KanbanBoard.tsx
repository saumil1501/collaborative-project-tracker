
import { useEffect, useState } from "react";
import api from "../services/api";
import { Plus, Trash2, ArrowLeft, Pencil } from "lucide-react";

type Status = "TODO" | "IN_PROGRESS" | "DONE";
type Priority = "LOW" | "MEDIUM" | "HIGH";

type Issue = {
  id: number;
  title: string;
  description: string | null;
  status: Status;
  priority: Priority;
  assigneeId: number | null;
  assigneeName: string | null;
  dueDate: string | null;
  createdAt: string;
};

type Member = {
  userId: number;
  name: string;
  email: string;
  role: string;
};

const columns: { status: Status; label: string }[] = [
  { status: "TODO", label: "To Do" },
  { status: "IN_PROGRESS", label: "In Progress" },
  { status: "DONE", label: "Done" },
];

export default function KanbanBoard({
  projectId,
  projectName,
  onBack,
}: {
  projectId: number;
  projectName: string;
  onBack: () => void;
}) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadBoard() {
    try {
      const [issueResponse, memberResponse] = await Promise.all([
        api.get<Issue[]>(`/projects/${projectId}/issues`),
        api.get<Member[]>(`/projects/${projectId}/members`),
      ]);
      setIssues(issueResponse.data);
      setMembers(memberResponse.data);
      setError("");
    } catch {
      setError("Failed to load project board.");
    }
  }

  useEffect(() => {
    void loadBoard();
  }, [projectId]);

  function resetForm() {
    setTitle("");
    setDescription("");
    setPriority("MEDIUM");
    setAssigneeId("");
    setDueDate("");
    setEditingId(null);
    setShowForm(false);
  }

  function editIssue(issue: Issue) {
    setEditingId(issue.id);
    setTitle(issue.title);
    setDescription(issue.description ?? "");
    setPriority(issue.priority);
    setAssigneeId(issue.assigneeId?.toString() ?? "");
    setDueDate(issue.dueDate ?? "");
    setShowForm(true);
  }

  async function saveIssue(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const payload = {
      title,
      description,
      priority,
      assigneeId: assigneeId ? Number(assigneeId) : null,
      dueDate: dueDate || null,
    };

    try {
      if (editingId !== null) {
        await api.put(
          `/projects/${projectId}/issues/${editingId}`,
          payload
        );
      } else {
        await api.post(`/projects/${projectId}/issues`, payload);
      }

      resetForm();
      await loadBoard();
    } catch {
      setError("Failed to save issue.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(issue: Issue, status: Status) {
    if (issue.status === status) return;
    setError("");

    try {
      await api.patch(
        `/projects/${projectId}/issues/${issue.id}/status`,
        { status }
      );
      await loadBoard();
    } catch {
      setError("Failed to update issue status.");
    }
  }

  async function deleteIssue(issueId: number) {
    if (!window.confirm("Delete this issue?")) return;

    try {
      await api.delete(`/projects/${projectId}/issues/${issueId}`);
      await loadBoard();
    } catch {
      setError("Failed to delete issue.");
    }
  }

  return (
    <div className="mt-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <button
            onClick={onBack}
            className="mb-3 flex items-center gap-2 text-sm text-slate-400 hover:text-white"
          >
            <ArrowLeft size={16} /> All Projects
          </button>
          <h2 className="text-3xl font-bold">{projectName}</h2>
          <p className="mt-1 text-slate-400">
            Manage tasks, assignments and progress
          </p>
        </div>

        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 hover:bg-indigo-500"
        >
          <Plus size={18} /> New Issue
        </button>
      </div>

      {error && <p className="mb-4 text-red-400">{error}</p>}

      {showForm && (
        <form
          onSubmit={saveIssue}
          className="mb-8 space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-6"
        >
          <h3 className="text-xl font-semibold">
            {editingId !== null ? "Edit Issue" : "Create Issue"}
          </h3>

          <input
            required
            maxLength={150}
            placeholder="Issue title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg bg-slate-800 p-3"
          />

          <textarea
            maxLength={2000}
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg bg-slate-800 p-3"
          />

          <div className="grid gap-4 md:grid-cols-3">
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className="rounded-lg bg-slate-800 p-3"
            >
              <option value="LOW">Low priority</option>
              <option value="MEDIUM">Medium priority</option>
              <option value="HIGH">High priority</option>
            </select>

            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="rounded-lg bg-slate-800 p-3"
            >
              <option value="">Unassigned</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="rounded-lg bg-slate-800 p-3"
            />
          </div>

          <div className="flex gap-3">
            <button
              disabled={saving}
              className="rounded-lg bg-indigo-600 px-5 py-2 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Issue"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg bg-slate-700 px-5 py-2"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {columns.map((column) => {
          const columnIssues = issues.filter(
            (issue) => issue.status === column.status
          );

          return (
            <div
              key={column.status}
              className="min-h-80 rounded-xl border border-slate-800 bg-slate-900/70 p-4"
            >
              <div className="mb-5 flex items-center justify-between">
                <h3 className="font-semibold">{column.label}</h3>
                <span className="rounded-full bg-slate-800 px-3 py-1 text-xs">
                  {columnIssues.length}
                </span>
              </div>

              <div className="space-y-3">
                {columnIssues.map((issue) => (
                  <div
                    key={issue.id}
                    className="rounded-xl border border-slate-700 bg-slate-800 p-4"
                  >
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <h4 className="font-medium">{issue.title}</h4>
                      <div className="flex gap-2">
                        <button
                          onClick={() => editIssue(issue)}
                          title="Edit issue"
                          className="text-slate-400 hover:text-white"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => deleteIssue(issue.id)}
                          title="Delete issue"
                          className="text-red-400"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>

                    <p className="mb-3 text-sm text-slate-400">
                      {issue.description || "No description"}
                    </p>

                    <div className="mb-3 flex flex-wrap gap-2 text-xs">
                      <span
                        className={`rounded-full px-2 py-1 ${
                          issue.priority === "HIGH"
                            ? "bg-red-500/20 text-red-300"
                            : issue.priority === "MEDIUM"
                              ? "bg-amber-500/20 text-amber-300"
                              : "bg-green-500/20 text-green-300"
                        }`}
                      >
                        {issue.priority}
                      </span>
                      {issue.dueDate && (
                        <span className="rounded-full bg-slate-700 px-2 py-1">
                          Due {issue.dueDate}
                        </span>
                      )}
                    </div>

                    <p className="mb-3 text-xs text-slate-400">
                      Assigned: {issue.assigneeName || "Unassigned"}
                    </p>

                    <select
                      value={issue.status}
                      onChange={(e) =>
                        changeStatus(issue, e.target.value as Status)
                      }
                      className="w-full rounded-lg bg-slate-700 p-2 text-sm"
                    >
                      {columns.map((option) => (
                        <option key={option.status} value={option.status}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
                {columnIssues.length === 0 && (
                  <p className="py-8 text-center text-sm text-slate-500">
                    No issues
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
