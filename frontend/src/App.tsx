import { useEffect, useState } from "react";
import api, { loadCsrf } from "./services/api";
import ProjectDashboard from "./components/ProjectDashboard";
import Notifications from "./components/Notifications";
import type { NotificationTarget } from "./components/Notifications";
import { FolderKanban, LayoutGrid, Users, Layers3, LogOut } from "lucide-react";

function readIssueLink(): NotificationTarget | null {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const projectId = Number(params.get("project"));
  const issueId = Number(params.get("issue"));
  return Number.isSafeInteger(projectId) && projectId > 0 && Number.isSafeInteger(issueId) && issueId > 0
    ? { projectId, issueId, requestId: Date.now() } : null;
}

type User = {
  id: number;
  name: string;
  email: string;
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [registerMode, setRegisterMode] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notificationTarget, setNotificationTarget] = useState<NotificationTarget | null>(readIssueLink);
  const [workspace, setWorkspace] = useState({ filter: "all" as "all" | "owned" | "shared", revision: 0 });

  useEffect(() => {
    loadCsrf()
      .then(() => api.get<User>("/auth/me"))
      .then(({ data }) => setUser(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onHashChange = () => setNotificationTarget(readIssueLink());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    try {
      if (registerMode) {
        await api.post("/auth/register", { name, email, password });
      }

      const { data } = await api.post<User>("/auth/login", {
        email,
        password,
      });

      setUser(data);
      setPassword("");
    } catch {
      setError("Authentication failed. Check your details.");
    }
  }

  async function logout() {
    await api.post("/auth/logout");
    setUser(null);
    setNotificationTarget(null);
    await loadCsrf();
  }

  if (loading) {
    return <div className="p-10">Loading...</div>;
  }

  if (user) {
    return (
      <main className="workspace-frame text-white">
        <div className="workspace-shell">
          <aside className="workspace-sidebar" aria-label="Workspace navigation">
            <a href="#" onClick={event => { event.preventDefault(); setNotificationTarget(null); setWorkspace(previous => ({ filter: "all", revision: previous.revision + 1 })); }} className="workspace-brand"><span><FolderKanban size={23} /></span>Project Tracker</a>
            <p className="sidebar-caption">WORKSPACE</p>
            <nav className="workspace-nav">
              {([{ filter: "all", label: "Overview", icon: LayoutGrid }, { filter: "owned", label: "My projects", icon: Layers3 }, { filter: "shared", label: "Shared with me", icon: Users }] as const).map(item => (
                <button key={item.filter} aria-current={workspace.filter === item.filter ? "page" : undefined} onClick={() => { setNotificationTarget(null); setWorkspace(previous => ({ filter: item.filter, revision: previous.revision + 1 })); }}><item.icon size={18} />{item.label}</button>
              ))}
            </nav>
            <div className="sidebar-note"><FolderKanban size={25} /><strong>A little more organised.</strong><p>Projects, people and progress. Together in one place.</p></div>
            <div className="sidebar-profile"><span className="profile-avatar">{user.name.slice(0, 1).toUpperCase()}</span><div><strong>{user.name}</strong><p>{user.email}</p></div></div>
          </aside>
          <div className="workspace-content">
          <header className="workspace-topbar">
            <div>
              <p className="text-xs text-slate-400">Workspace <span className="mx-2 text-slate-600">/</span> Projects</p>
              <h1 className="mt-1 text-sm font-medium">Welcome, {user.name}</h1>
            </div>

            <div className="flex items-center gap-3">
              <Notifications key={user.id} onOpen={target => setNotificationTarget(previous => ({ ...target, requestId: (previous?.requestId ?? 0) + 1 }))} />
              <button
                onClick={logout}
                className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                <LogOut size={16} /> Logout
              </button>
            </div>
          </header>

          <ProjectDashboard key={`${user.id}:${workspace.revision}`} currentUserId={user.id} ownershipFilter={workspace.filter} notificationTarget={notificationTarget} />

          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-5 rounded-2xl border border-slate-800 bg-slate-900 p-8"
      >
        <h1 className="text-3xl font-bold">
          {registerMode ? "Create account" : "Welcome back"}
        </h1>

        {registerMode && (
          <input
            required
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg bg-slate-800 p-3"
          />
        )}

        <input
          required
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg bg-slate-800 p-3"
        />

        <input
          required
          type="password"
          minLength={registerMode ? 8 : undefined}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg bg-slate-800 p-3"
        />

        {error && <p className="text-red-400">{error}</p>}

        <button className="w-full rounded-lg bg-indigo-600 p-3 font-semibold">
          {registerMode ? "Register" : "Login"}
        </button>

        <button
          type="button"
          onClick={() => {
            setRegisterMode(!registerMode);
            setError("");
          }}
          className="w-full text-sm text-indigo-400"
        >
          {registerMode
            ? "Already have an account? Login"
            : "Don't have an account? Register"}
        </button>
      </form>
    </main>
  );
}
