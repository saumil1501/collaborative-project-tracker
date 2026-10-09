import { useEffect, useState } from "react";
import api from "../services/api";

type Member = {
  userId: number;
  name: string;
  email: string;
  role: string;
};

type Props = {
  projectId: number;
  isOwner: boolean;
};

export default function ProjectMembers({ projectId, isOwner }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);

  async function fetchMembers() {
    try {
      const { data } = await api.get<Member[]>(
        `/projects/${projectId}/members`
      );
      setMembers(data);
    } catch {
      setError("Unable to load members");
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    api.get<Member[]>(`/projects/${projectId}/members`, { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setMembers(data); })
      .catch(() => { if (!controller.signal.aborted) setError("Unable to load members"); });
    return () => controller.abort();
  }, [projectId]);

  async function addMember(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setAdding(true);

    try {
      await api.post(`/projects/${projectId}/members`, { email });
      setEmail("");
      await fetchMembers();
    } catch {
      setError("Could not add member. Check email or membership.");
    } finally { setAdding(false); }
  }

  return (
    <details className="team-details">
      <summary aria-label="Show team members"><span className="team-avatars">{members.slice(0, 3).map(member => <span key={member.userId} title={member.name}>{member.name.trim().split(/\s+/).map(word => word[0]).slice(0, 2).join("")}</span>)}</span><span>{members.length} members</span></summary>
      <div className="team-expanded">
      <h4 className="mb-3 font-semibold">Team Members</h4>

      <div className="space-y-2">
        {members.map((member) => (
          <div
            key={member.userId}
            className="flex justify-between text-sm"
          >
            <span>{member.name}</span>
            <span className="text-slate-400">{member.role}</span>
          </div>
        ))}
      </div>

      {isOwner && (
        <form onSubmit={addMember} className="mt-4 flex gap-2">
          <input
            type="email"
            required
            placeholder="Member email"
            aria-label="Member email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-w-0 flex-1 rounded bg-slate-800 p-2 text-sm"
          />

          <button disabled={adding} className="rounded bg-indigo-600 px-3 text-sm disabled:opacity-50">
            {adding ? "Adding…" : "Add"}
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-red-400">{error}</p>
      )}
      </div>
    </details>
  );
}
