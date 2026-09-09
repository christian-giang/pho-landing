import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireOwner } from "../lib/auth.js";
import { menuSchema, type Menu } from "../lib/menuSchema.js";
import { readJson, writeFile } from "../lib/store.js";
import { renderMenuPdfs, PDF_FILES } from "../lib/menuPdf.js";

/**
 * Owner-editable menu (menu.json) plus the two Abendkarte PDFs derived from it.
 *
 * The PDFs are regenerated on every save and never copied, so a downloadable
 * card can't go stale relative to the website. This handler needs the extra
 * memory and duration configured for it in vercel.json — it starts a Chromium.
 *
 * The menu is stored first and the PDFs after: if rendering fails, the website
 * is still correct and the response says the cards are stale, which is a much
 * better failure than rejecting the owner's edit.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireOwner(req, res)) return;

  if (req.method === "GET") {
    const menu = await readJson<Menu>("menu.json");
    if (!menu) {
      return res.status(404).json({ ok: false, error: "menu.json nicht gefunden" });
    }
    return res.status(200).json({ ok: true, menu });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false });
  }

  const parsed = menuSchema.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return res.status(400).json({
      ok: false,
      error: `Ungültige Daten: ${issue?.path.join(".")} – ${issue?.message}`,
    });
  }

  try {
    await writeFile("menu.json", JSON.stringify(parsed.data, null, 2) + "\n");
  } catch (err) {
    console.error("menu save failed:", err);
    return res.status(500).json({ ok: false, error: "Speichern fehlgeschlagen." });
  }

  const rendered = await renderMenuPdfs(parsed.data);
  if (!rendered.ok) {
    console.error("pdf render failed:", rendered.error);
    return res.status(200).json({ ok: true, pdf: { ok: false, error: rendered.error } });
  }

  try {
    await Promise.all(
      (["de", "en"] as const).map((lang) =>
        writeFile(PDF_FILES[lang] as "abendkarte.pdf" | "abendkarte-en.pdf", rendered.pdfs[lang]),
      ),
    );
  } catch (err) {
    console.error("pdf upload failed:", err);
    return res.status(200).json({ ok: true, pdf: { ok: false, error: String(err) } });
  }

  return res.status(200).json({ ok: true, pdf: { ok: true } });
}
