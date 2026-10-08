
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { FolderKanban, Plus, Trash2, ArrowRight } from "lucide-react";
import api from "../services/api";
import ProjectMembers from "./ProjectMembers";
import KanbanBoard from "./KanbanBoard";

type Project = {
  id: number;
  name: string;
  description: string | null;
  ownerId: number;
  createdAt: string;
};

type ProjectDashboardProps = {
  currentUserId: number;
};

export default function ProjectDashboard({
  currentUserId,
}: ProjectDashboardProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [selectedProject, setSelectedProject] =
    useState<Project | null>(null);

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
    void fetchProjects();
  }, []);

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
        projectId={selectedProject.id}
        projectName={selectedProject.name}
        onBack={() => {
          setSelectedProject(null);
          void fetchProjects();
        }}
      />
    );
  }

  return (
    <div className="mt-10">
      {/* Dashboard Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-white">
            Your Projects
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Manage your projects, teams, and tasks.
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
        /* Project Cards */
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            const isOwner = project.ownerId === currentUserId;

            return (
              <div
                key={project.id}
                className="flex flex-col rounded-xl border border-slate-800 bg-slate-900 p-6 transition hover:border-slate-700"
              >
                {/* Project Information */}
                <FolderKanban className="mb-4 text-indigo-400" />

                <h3 className="break-words text-xl font-semibold text-white">
                  {project.name}
                </h3>

                <p className="mt-2 min-h-12 break-words text-sm text-slate-400">
                  {project.description || "No description"}
                </p>

                {/* Open Kanban Board */}
                <button
                  type="button"
                  onClick={() => setSelectedProject(project)}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500"
                >
                  Open Board
                  <ArrowRight size={16} />
                </button>

                {/* Team Members Section */}
                <ProjectMembers
                  projectId={project.id}
                  isOwner={isOwner}
                />

                {/* Project Footer */}
                <div className="mt-auto flex items-center justify-between pt-5">
                  <span className="text-xs text-slate-500">
                    Created{" "}
                    {new Date(project.createdAt).toLocaleDateString()}
                  </span>

                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => deleteProject(project.id)}
                      title="Delete project"
                      aria-label={`Delete ${project.name}`}
                      className="rounded-lg p-2 text-red-400 transition hover:bg-red-500/10 hover:text-red-300"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
