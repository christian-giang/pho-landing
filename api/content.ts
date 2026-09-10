import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireOwner } from "../lib/auth.js";
import { contentSchema, type Content } from "../lib/contentSchema.js";
import { readJson, writeFile } from "../lib/store.js";

/**
 * Owner-editable website text (content.json). Like /api/menu but with no PDF
 * regeneration — a text save is just validate → store.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireOwner(req, res)) return;

  if (req.method === "GET") {
    const content = await readJson<Content>("content.json");
    if (!content) {
      return res.status(404).json({ ok: false, error: "content.json nicht gefunden" });
    }
    return res.status(200).json({ ok: true, content });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false });
  }

  const parsed = contentSchema.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return res.status(400).json({
      ok: false,
      error: `Ungültige Daten: ${issue?.path.join(".")} – ${issue?.message}`,
    });
  }

  try {
    await writeFile("content.json", JSON.stringify(parsed.data, null, 2) + "\n");
  } catch (err) {
    console.error("content save failed:", err);
    const detail = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ ok: false, error: "Speichern fehlgeschlagen.", detail });
  }

  return res.status(200).json({ ok: true });
}
