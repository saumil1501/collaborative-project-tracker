import { useEffect, useState } from "react";
import { FolderKanban, Plus, Trash2 } from "lucide-react";
import api from "../services/api";

type Project = {
  id: number;
  name: string;
  description: string | null;
  ownerId: number;
  createdAt: string;
};

export default function ProjectDashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");

  async function fetchProjects() {
    try {
      const { data } = await api.get<Project[]>("/projects");
      setProjects(data);
    } catch {
      setError("Failed to load projects");
    }
  }

  useEffect(() => {
    void fetchProjects();
  }, []);

  async function createProject(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    try {
      await api.post("/projects", { name, description });
      setName("");
      setDescription("");
      setShowForm(false);
      await fetchProjects();
    } catch {
      setError("Failed to create project");
    }
  }

  async function deleteProject(id: number) {
    if (!window.confirm("Delete this project?")) return;

    try {
      await api.delete(`/projects/${id}`);
      await fetchProjects();
    } catch {
      setError("Failed to delete project");
    }
  }

  return (
    <div className="mt-10">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Your Projects</h2>

        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2"
        >
          <Plus size={18} /> New Project
        </button>
      </div>

      {error && <p className="mb-4 text-red-400">{error}</p>}

      {showForm && (
        <form
          onSubmit={createProject}
          className="mb-6 space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-5"
        >
          <input
            required
            maxLength={150}
            placeholder="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg bg-slate-800 p-3"
          />

          <textarea
            maxLength={1000}
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg bg-slate-800 p-3"
          />

          <button className="rounded-lg bg-indigo-600 px-5 py-2">
            Create Project
          </button>
        </form>
      )}

      {projects.length === 0 ? (
        <p className="text-slate-400">
          No projects yet. Create your first project!
        </p>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <div
              key={project.id}
              className="rounded-xl border border-slate-800 bg-slate-900 p-6"
            >
              <FolderKanban className="mb-4 text-indigo-400" />

              <h3 className="text-xl font-semibold">{project.name}</h3>

              <p className="mt-2 min-h-12 text-sm text-slate-400">
                {project.description || "No description"}
              </p>

              <div className="mt-5 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  {new Date(project.createdAt).toLocaleDateString()}
                </span>

                <button
                  onClick={() => deleteProject(project.id)}
                  className="text-red-400 hover:text-red-300"
                  title="Delete project"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}