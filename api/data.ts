import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isStoredFile, readFile, CONTENT_TYPES } from "../lib/store.js";

/**
 * Public read endpoint for the four owner-mutable files. vercel.json rewrites
 * the paths the website already asks for onto this handler:
 *
 *   /menu.json                 -> /api/data?file=menu.json
 *   /content.json              -> /api/data?file=content.json
 *   /assets/abendkarte.pdf     -> /api/data?file=abendkarte.pdf
 *   /assets/abendkarte-en.pdf  -> /api/data?file=abendkarte-en.pdf
 *
 * That is why these four are NOT in public/ — Vercel resolves the filesystem
 * before rewrites, so a static file of the same name would shadow this and the
 * site would be stuck on the seed forever.
 */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).end();
  }

  const raw = req.query.file;
  const name = Array.isArray(raw) ? raw[0] : raw;
  if (!name || !isStoredFile(name)) {
    return res.status(404).json({ ok: false, error: "unknown file" });
  }

  const file = await readFile(name);
  if (!file) {
    return res.status(404).json({ ok: false, error: "not available" });
  }

  res.setHeader("Content-Type", CONTENT_TYPES[name]);
  res.setHeader("Content-Length", String(file.body.length));
  // Matches the Blob TTL: an owner save is live within a minute, and the CDN
  // keeps serving the old copy meanwhile rather than hitting this function.
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=600");
  res.setHeader("X-Data-Source", file.source);

  if (req.method === "HEAD") return res.status(200).end();
  return res.status(200).send(file.body);
}
