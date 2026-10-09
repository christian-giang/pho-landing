import fs from "node:fs";
import path from "node:path";
import { Redis } from "@upstash/redis";

/**
 * Storage for the four owner-mutable files (menu.json, content.json and the two
 * generated Abendkarte PDFs).
 *
 * Vercel's filesystem is read-only, so these cannot live next to the site the
 * way they did on the builder's disk. They live in Upstash Redis instead, with
 * the versions exported from the builder committed under seed/ as a fallback:
 * a fresh deployment with an empty store serves the seed, and the first owner
 * save switches it over. Nothing needs to be seeded manually.
 *
 * They used to live in Vercel Blob, but every Blob write is an "advanced
 * operation" and the Hobby plan only allows 2,000 a month. Upstash's free tier
 * is measured in hundreds of thousands of commands, which this site will never
 * approach. Blob is still read (never written) as a middle fallback, so the
 * owner's last Blob-era save stays live until the first save into Redis.
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

/**
 * The Upstash connection, or null when no store is connected. The Vercel
 * Marketplace integration sets KV_REST_API_*; a store created directly on
 * upstash.com gives UPSTASH_REDIS_REST_*. Either works.
 */
let redisClient: Redis | null | undefined;

function redis(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  // Bodies are stored as base64 strings; keep the client from JSON-parsing them.
  redisClient = url && token ? new Redis({ url, token, automaticDeserialization: false }) : null;
  return redisClient;
}

/** True when a store is wired up; without it the seed is served read-only. */
export function storeConfigured(): boolean {
  return redis() !== null;
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
 * The legacy Blob copy, read-only. Blobs were written with
 * `addRandomSuffix: false`, so the URL is fixed and is fetched directly — a
 * plain GET costs no Blob advanced operation (unlike `list()`). The store id
 * comes from the token (`vercel_blob_rw_<storeId>_<secret>`) or BLOB_BASE_URL.
 */
function legacyBlobUrl(name: StoredFile): string | null {
  const explicit = process.env.BLOB_BASE_URL?.trim().replace(/\/+$/, "");
  const storeId = process.env.BLOB_READ_WRITE_TOKEN?.split("_")[3];
  const base =
    explicit || (storeId ? `https://${storeId.toLowerCase()}.public.blob.vercel-storage.com` : null);
  return base ? `${base}/${PREFIX}${name}` : null;
}

async function readLegacyBlob(name: StoredFile): Promise<Buffer | null> {
  const url = legacyBlobUrl(name);
  if (!url) return null;
  try {
    const res = await fetch(url);
    return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

/**
 * Each file is one hash: `body` (base64) and `at` (epoch ms of the write), set
 * together in a single HSET so they can never disagree.
 */
async function readRedis(name: StoredFile): Promise<Buffer | null> {
  const r = redis();
  if (!r) return null;
  try {
    const b64 = await r.hget<string>(PREFIX + name, "body");
    return b64 ? Buffer.from(b64, "base64") : null;
  } catch (err) {
    // A store outage must not take the website down — fall through.
    console.error(`redis read failed for ${name}:`, err);
    return null;
  }
}

/** When a stored file was last written to Redis, or null if it never was. */
export async function uploadedAt(name: StoredFile): Promise<Date | null> {
  const r = redis();
  if (!r) return null;
  try {
    const at = await r.hget<string>(PREFIX + name, "at");
    return at ? new Date(Number(at)) : null;
  } catch {
    return null;
  }
}

export interface ReadResult {
  body: Buffer;
  /** Where it came from, surfaced in a response header for debugging. */
  source: "redis" | "blob" | "seed";
}

/** Current bytes for a stored file: Redis, else the legacy Blob copy, else the seed. */
export async function readFile(name: StoredFile): Promise<ReadResult | null> {
  const fromRedis = await readRedis(name);
  if (fromRedis) return { body: fromRedis, source: "redis" };
  const fromBlob = await readLegacyBlob(name);
  if (fromBlob) return { body: fromBlob, source: "blob" };
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
  const r = redis();
  if (!r) {
    throw new Error(
      "No Upstash Redis store is connected (KV_REST_API_URL / KV_REST_API_TOKEN) — connect one before saving.",
    );
  }
  const buf = typeof body === "string" ? Buffer.from(body, "utf8") : body;
  try {
    await r.hset(PREFIX + name, { body: buf.toString("base64"), at: String(Date.now()) });
  } catch (err) {
    // Surface the real reason (bad token, quota, etc.) rather than letting it
    // collapse into a generic 500 upstream.
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Store write failed for ${name}: ${msg}`);
  }
}
