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

    try {
      await api.post(`/projects/${projectId}/members`, { email });
      setEmail("");
      await fetchMembers();
    } catch {
      setError("Could not add member. Check email or membership.");
    }
  }

  return (
    <div className="mt-5 border-t border-slate-700 pt-4">
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
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-w-0 flex-1 rounded bg-slate-800 p-2 text-sm"
          />

          <button className="rounded bg-indigo-600 px-3 text-sm">
            Add
          </button>
        </form>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}
