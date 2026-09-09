import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import AdminEditor from "./AdminEditor.js";
import OwnerGate from "./OwnerGate.js";
import type { Menu } from "../../lib/menuSchema.js";
import type { Content } from "../../lib/contentSchema.js";

/**
 * Entry point for the owner admin, which is a plain SPA here rather than the
 * server-rendered page it was on the builder. The gate is the API itself:
 * /api/menu answers 401 without a valid owner cookie, so a 401 on load means
 * "show the password form".
 */

type State =
  | { phase: "loading" }
  | { phase: "locked" }
  | { phase: "ready"; menu: Menu; content: Content | null }
  | { phase: "error"; message: string };

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-screen items-center justify-center px-6">{children}</main>;
}

function App() {
  const [state, setState] = useState<State>({ phase: "loading" });

  useEffect(() => {
    (async () => {
      try {
        const menuRes = await fetch("/api/menu");
        if (menuRes.status === 401) return setState({ phase: "locked" });
        const menuBody = await menuRes.json().catch(() => null);
        if (!menuRes.ok || !menuBody?.ok) {
          return setState({
            phase: "error",
            message: menuBody?.error || "Die Speisekarte konnte nicht geladen werden.",
          });
        }

        // Text editing is simply hidden when content.json is unavailable.
        const contentRes = await fetch("/api/content");
        const contentBody = contentRes.ok ? await contentRes.json().catch(() => null) : null;

        setState({
          phase: "ready",
          menu: menuBody.menu as Menu,
          content: (contentBody?.content as Content | undefined) ?? null,
        });
      } catch {
        setState({ phase: "error", message: "Netzwerkfehler. Bitte Seite neu laden." });
      }
    })();
  }, []);

  if (state.phase === "loading") {
    return (
      <Shell>
        <p className="text-zinc-400">Wird geladen …</p>
      </Shell>
    );
  }
  if (state.phase === "locked") return <OwnerGate title="Phở Restaurant Konstanz" />;
  if (state.phase === "error") {
    return (
      <Shell>
        <p className="text-zinc-400">{state.message}</p>
      </Shell>
    );
  }
  return <AdminEditor initialMenu={state.menu} initialContent={state.content} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
