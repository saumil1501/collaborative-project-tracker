import { useEffect, useState } from "react";
import api, { loadCsrf } from "./services/api";
import ProjectDashboard from "./components/ProjectDashboard";

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

  useEffect(() => {
    loadCsrf()
      .then(() => api.get<User>("/auth/me"))
      .then(({ data }) => setUser(data))
      .catch(() => {})
      .finally(() => setLoading(false));
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
    await loadCsrf();
  }

  if (loading) {
    return <div className="p-10">Loading...</div>;
  }

  if (user) {
    return (
      <main className="min-h-screen bg-slate-950 text-white p-10">
        <div className="mx-auto max-w-4xl">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold">
                Welcome, {user.name}
              </h1>
              <p className="text-slate-400">{user.email}</p>
            </div>

            <button
              onClick={logout}
              className="rounded-lg bg-red-600 px-5 py-2"
            >
              Logout
            </button>
          </div>

          <ProjectDashboard currentUserId={user.id} />

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