import fs from "node:fs";
import path from "node:path";
import { list, put } from "@vercel/blob";

/**
 * Storage for the four owner-mutable files (menu.json, content.json and the two
 * generated Abendkarte PDFs).
 *
 * Vercel's filesystem is read-only, so these cannot live next to the site the
 * way they did on the builder's disk. They live in Vercel Blob instead, with
 * the versions exported from the builder committed under seed/ as a fallback:
 * a fresh deployment with an empty Blob store serves the seed, and the first
 * owner save switches it over. Nothing needs to be seeded manually.
 */

export type StoredFile =
  | "menu.json"
  | "content.json"
  | "abendkarte.pdf"
  | "abendkarte-en.pdf";

export const STORED_FILES: StoredFile[] = [
  "menu.json",
  "content.json",
  "abendkarte.pdf",
  "abendkarte-en.pdf",
];

export function isStoredFile(name: string): name is StoredFile {
  return (STORED_FILES as string[]).includes(name);
}

export const CONTENT_TYPES: Record<StoredFile, string> = {
  "menu.json": "application/json; charset=utf-8",
  "content.json": "application/json; charset=utf-8",
  "abendkarte.pdf": "application/pdf",
  "abendkarte-en.pdf": "application/pdf",
};

const PREFIX = "site/";

/** True when a Blob store is wired up; without it the seed is served read-only. */
export function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/**
 * The seed directory, resolved defensively: `vercel.json` ships seed/ into the
 * functions via includeFiles, but the layout of the bundle is not contractual,
 * so probe the plausible roots rather than hard-coding one.
 */
function seedPath(name: StoredFile): string | null {
  const candidates = [
    path.join(process.cwd(), "seed", name),
    path.join(import.meta.dirname, "..", "seed", name),
    path.join(import.meta.dirname, "..", "..", "seed", name),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

function readSeed(name: StoredFile): Buffer | null {
  const p = seedPath(name);
  if (!p) return null;
  try {
    return fs.readFileSync(p);
  } catch {
    return null;
  }
}

/**
 * Locate a blob by exact pathname. `addRandomSuffix: false` keeps the pathname
 * stable across overwrites, but the CDN would then happily serve a stale copy —
 * so callers fetch with the `uploadedAt` stamp appended as a cache buster.
 */
async function findBlob(name: StoredFile): Promise<{ url: string; uploadedAt: Date } | null> {
  if (!blobConfigured()) return null;
  try {
    const { blobs } = await list({ prefix: PREFIX + name, limit: 10 });
    const hit = blobs.find((b) => b.pathname === PREFIX + name);
    return hit ? { url: hit.url, uploadedAt: hit.uploadedAt } : null;
  } catch {
    // A Blob outage must not take the website down — fall through to the seed.
    return null;
  }
}

export interface ReadResult {
  body: Buffer;
  /** Where it came from, surfaced in a response header for debugging. */
  source: "blob" | "seed";
}

/** Current bytes for a stored file: Blob if present, otherwise the seed. */
export async function readFile(name: StoredFile): Promise<ReadResult | null> {
  const found = await findBlob(name);
  if (found) {
    try {
      const bust = `?v=${found.uploadedAt.getTime()}`;
      const res = await fetch(found.url + bust);
      if (res.ok) {
        return { body: Buffer.from(await res.arrayBuffer()), source: "blob" };
      }
    } catch {
      /* fall through to the seed */
    }
  }
  const seed = readSeed(name);
  return seed ? { body: seed, source: "seed" } : null;
}

/** Parsed JSON for one of the two JSON files, or null if unreadable. */
export async function readJson<T>(name: "menu.json" | "content.json"): Promise<T | null> {
  const r = await readFile(name);
  if (!r) return null;
  try {
    return JSON.parse(r.body.toString("utf8")) as T;
  } catch {
    return null;
  }
}

export async function writeFile(name: StoredFile, body: Buffer | string): Promise<void> {
  if (!blobConfigured()) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is not set — connect a Blob store before saving.",
    );
  }
  await put(PREFIX + name, body, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: CONTENT_TYPES[name],
    // Short TTL: an owner save should show up on the site within a minute.
    cacheControlMaxAge: 60,
  });
}
