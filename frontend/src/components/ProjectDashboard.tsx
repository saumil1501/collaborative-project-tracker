
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { FolderKanban, Plus, Trash2, ArrowRight, Search } from "lucide-react";
import api from "../services/api";
import ProjectMembers from "./ProjectMembers";
import KanbanBoard from "./KanbanBoard";
import type { NotificationTarget } from "./Notifications";

type Project = {
  id: number;
  name: string;
  description: string | null;
  ownerId: number;
  createdAt: string;
};

type ProjectDashboardProps = {
  currentUserId: number;
  notificationTarget?: NotificationTarget | null;
  ownershipFilter?: "all" | "owned" | "shared";
};

export default function ProjectDashboard({
  currentUserId,
  notificationTarget,
  ownershipFilter = "all",
}: ProjectDashboardProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [query, setQuery] = useState("");
  const [summaries, setSummaries] = useState<Record<number, { todo: number; progress: number; done: number } | null>>({});
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [selectedProject, setSelectedProject] =
    useState<Project | null>(null);
  const [activeTarget, setActiveTarget] = useState<NotificationTarget | null>(null);

  useEffect(() => {
    if (!notificationTarget) return;
    const controller = new AbortController();
    api.get<Project>(`/projects/${notificationTarget.projectId}`, { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) { setSelectedProject(data); setActiveTarget(notificationTarget); setError(""); } })
      .catch(() => {
        if (!controller.signal.aborted) { setSelectedProject(null); setActiveTarget(null); setError("This project is no longer available to you."); }
      });
    return () => controller.abort();
  }, [notificationTarget]);

  // Fetch projects accessible to the logged-in user
  async function fetchProjects() {
    try {
      const { data } = await api.get<Project[]>("/projects");
      setProjects(data);
      setError("");
    } catch {
      setError("Failed to load projects.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    api.get<Project[]>("/projects", { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setProjects(data); })
      .catch(() => { if (!controller.signal.aborted) setError("Failed to load projects."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all(projects.map(async project => {
      try {
        const { data } = await api.get<{ status: string }[]>(`/projects/${project.id}/issues`, { signal: controller.signal });
        return [project.id, { todo: data.filter(issue => issue.status === "TODO").length, progress: data.filter(issue => issue.status === "IN_PROGRESS").length, done: data.filter(issue => issue.status === "DONE").length }] as const;
      } catch { return [project.id, null] as const; }
    })).then(results => { if (!controller.signal.aborted) setSummaries(Object.fromEntries(results)); });
    return () => controller.abort();
  }, [projects]);

  const scopedProjects = projects.filter(project => ownershipFilter === "all" || (ownershipFilter === "owned" ? project.ownerId === currentUserId : project.ownerId !== currentUserId));
  const visibleProjects = scopedProjects.filter(project => `${project.name} ${project.description || ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  const statsReady = scopedProjects.every(project => Object.hasOwn(summaries, project.id) && summaries[project.id] !== null);
  const totals = scopedProjects.reduce((total, project) => {
    const summary = summaries[project.id];
    if (summary) { total.todo += summary.todo; total.progress += summary.progress; total.done += summary.done; }
    return total;
  }, { todo: 0, progress: 0, done: 0 });
  const totalIssues = totals.todo + totals.progress + totals.done;

  // Create a new project
  async function createProject(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!name.trim()) {
      setError("Project name cannot be empty.");
      return;
    }

    setCreating(true);
    setError("");

    try {
      await api.post("/projects", {
        name: name.trim(),
        description: description.trim(),
      });

      setName("");
      setDescription("");
      setShowForm(false);

      await fetchProjects();
    } catch {
      setError("Failed to create project.");
    } finally {
      setCreating(false);
    }
  }

  // Delete a project (owner only)
  async function deleteProject(id: number) {
    if (
      !window.confirm(
        "Are you sure you want to delete this project? All its issues will also be deleted."
      )
    ) {
      return;
    }

    setError("");

    try {
      await api.delete(`/projects/${id}`);
      await fetchProjects();
    } catch {
      setError("Failed to delete project.");
    }
  }

  // Display Kanban board for selected project
  if (selectedProject) {
    return (
      <KanbanBoard
        key={`${selectedProject.id}:${activeTarget?.requestId ?? 0}`}
        projectId={selectedProject.id}
        projectName={selectedProject.name}
        currentUserId={currentUserId}
        initialIssueId={activeTarget?.issueId}
        initialSettings={activeTarget != null && activeTarget.issueId === null}
        onProjectUpdated={project => {
          setSelectedProject(project);
          setProjects(previous => previous.map(item => item.id === project.id ? project : item));
        }}
        onBack={() => {
          setActiveTarget(null);
          setSelectedProject(null);
          void fetchProjects();
        }}
      />
    );
  }

  return (
    <div className="dashboard-body">
      {/* Dashboard Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-white">
            {ownershipFilter === "owned" ? "My projects" : ownershipFilter === "shared" ? "Shared with me" : "Projects overview"}
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Keep an eye on your team’s work and move every project forward.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-white transition hover:bg-indigo-500"
        >
          <Plus size={18} />
          New Project
        </button>
      </div>

      <div className="summary-grid">
        {[
          { label: "Total projects", value: loading ? "—" : scopedProjects.length, caption: "In this workspace view", ratio: totalIssues ? totals.done / totalIssues : 0 },
          { label: "To do", value: statsReady && !loading ? totals.todo : "—", caption: "Issues waiting to start", ratio: totalIssues ? totals.todo / totalIssues : 0 },
          { label: "In progress", value: statsReady && !loading ? totals.progress : "—", caption: "Issues moving forward", ratio: totalIssues ? totals.progress / totalIssues : 0 },
          { label: "Completed", value: statsReady && !loading ? totals.done : "—", caption: "Issues marked done", ratio: totalIssues ? totals.done / totalIssues : 0 },
        ].map(stat => <section className="summary-card" key={stat.label} aria-label={stat.label}>
          <div><p className="summary-label">{stat.label}</p><strong>{stat.value}</strong><p className="summary-caption">{stat.caption}</p></div>
          <svg className="summary-ring" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="25" className="ring-track" /><circle cx="32" cy="32" r="25" className="ring-value" strokeDasharray={`${statsReady ? stat.ratio * 157.08 : 0} 157.08`} /><circle cx="32" cy="32" r="16" className="ring-inner" /></svg>
        </section>)}
      </div>
      {!loading && !statsReady && <p className="mb-5 text-xs text-slate-400">Issue summaries are loading or unavailable. You can still open your projects.</p>}

      {/* Error Message */}
      {error && (
        <div className="mb-5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Create Project Form */}
      {showForm && (
        <form
          onSubmit={createProject}
          className="mb-6 space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-5"
        >
          <h3 className="text-lg font-semibold text-white">
            Create New Project
          </h3>

          <div>
            <label
              htmlFor="project-name"
              className="mb-2 block text-sm text-slate-300"
            >
              Project Name
            </label>

            <input
              id="project-name"
              type="text"
              required
              maxLength={150}
              placeholder="Enter project name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 p-3 text-white outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label
              htmlFor="project-description"
              className="mb-2 block text-sm text-slate-300"
            >
              Description
            </label>

            <textarea
              id="project-description"
              maxLength={1000}
              rows={3}
              placeholder="Describe your project"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 p-3 text-white outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-indigo-600 px-5 py-2 font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create Project"}
            </button>

            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg bg-slate-700 px-5 py-2 text-white hover:bg-slate-600"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Loading State */}
      {loading ? (
        <p className="text-slate-400">Loading projects...</p>
      ) : projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/50 p-10 text-center">
          <FolderKanban
            size={42}
            className="mx-auto mb-4 text-slate-500"
          />

          <h3 className="text-lg font-semibold text-white">
            No projects yet
          </h3>

          <p className="mt-2 text-sm text-slate-400">
            Create your first project to get started.
          </p>
        </div>
      ) : (
        <section className="projects-panel" aria-label="Project list">
          <div className="projects-toolbar"><div><h3>All projects <span>{scopedProjects.length}</span></h3><p>Your team’s work, at a glance.</p></div><label className="project-search"><Search size={17} /><input aria-label="Search projects" placeholder="Search projects…" value={query} onChange={event => setQuery(event.target.value)} /></label></div>
          <div className="project-table-scroll"><table className="project-table">
            <thead><tr><th>Project</th><th>Issues</th><th>Members</th><th>Status</th><th>Completion</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{visibleProjects.map(project => {
              const isOwner = project.ownerId === currentUserId;
              const summary = summaries[project.id];
              const count = summary ? summary.todo + summary.progress + summary.done : null;
              const percent = count && summary ? Math.round(summary.done / count * 100) : 0;
              const status = !summary ? "Unavailable" : !count ? "No issues" : summary.done === count ? "Completed" : summary.progress || summary.done ? "In progress" : "To do";
              return <tr key={project.id}>
                <td data-label="Project"><div className="project-identity"><span className="project-icon"><FolderKanban size={21} /></span><div><h3>{project.name}</h3><p>{project.description || "No description"}</p><small>{isOwner ? "Owner" : "Member"} · Created {new Date(project.createdAt).toLocaleDateString()}</small></div></div></td>
                <td data-label="Issues"><span className="issue-count">{count ?? "—"}</span></td>
                <td data-label="Members"><ProjectMembers projectId={project.id} isOwner={isOwner} /></td>
                <td data-label="Status"><span className={`project-status ${status === "Completed" ? "is-complete" : status === "In progress" ? "is-progress" : ""}`}><span />{status}</span></td>
                <td data-label="Completion"><div className="completion"><span>{summary ? `${percent}%` : "—"}</span><div><span style={{ width: `${percent}%` }} /></div></div></td>
                <td className="project-actions"><button type="button" onClick={() => { setActiveTarget(null); setSelectedProject(project); }} className="open-board">Open Board <ArrowRight size={15} /></button>{isOwner && <button type="button" onClick={() => deleteProject(project.id)} title="Delete project" aria-label={`Delete ${project.name}`} className="delete-project"><Trash2 size={16} /></button>}</td>
              </tr>;
            })}</tbody>
          </table></div>
          {visibleProjects.length === 0 && <p className="p-8 text-center text-sm text-slate-400">{query ? "No projects match your search." : "No projects in this view."}</p>}
          <div className="projects-footer">Showing {visibleProjects.length} of {scopedProjects.length} projects<span>Only projects you can access</span></div>
        </section>
      )}
    </div>
  );
}
