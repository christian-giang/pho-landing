import { useState } from "react";

/** Password gate for the restaurant-owner menu admin. */
export default function OwnerGate({ title }: { title: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      window.location.reload();
      return;
    }
    setError(
      res.status === 429
        ? "Zu viele Versuche. Bitte warten Sie ein paar Minuten."
        : "Falsches Passwort.",
    );
    setLoading(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900/60 p-6"
      >
        <h1 className="text-lg font-semibold text-zinc-100">{title}</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Speisekarten-Verwaltung – bitte Passwort eingeben.
        </p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          placeholder="Passwort"
          className="mt-4 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
        />
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={loading || !password}
          className="mt-4 w-full rounded-lg bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-50"
        >
          {loading ? "Wird geprüft…" : "Anmelden"}
        </button>
      </form>
    </main>
  );
}
