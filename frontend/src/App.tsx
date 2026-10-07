import { useEffect, useState } from "react";
import { Activity, CheckCircle2, Loader2 } from "lucide-react";
import api from "./services/api";

function App() {
  const [status, setStatus] = useState("Checking connection...");
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    api
      .get("/health")
      .then((response) => {
        setStatus(response.data.status);
        setConnected(true);
      })
      .catch(() => {
        setStatus("Backend connection failed");
        setConnected(false);
      });
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <Activity className="h-8 w-8 text-indigo-400" />
          <h1 className="text-2xl font-bold">
            Collaborative Project Tracker
          </h1>
        </div>

        <p className="mb-6 text-slate-400">
          React + Spring Boot + MySQL
        </p>

        <div className="flex items-center gap-3 rounded-xl bg-slate-800 p-4">
          {connected ? (
            <CheckCircle2 className="text-green-400" />
          ) : (
            <Loader2 className="text-amber-400" />
          )}

          <div>
            <p className="text-sm text-slate-400">
              Backend connection
            </p>
            <p className="font-semibold">{status}</p>
          </div>
        </div>
      </div>
    </main>
  );
}

export default App;