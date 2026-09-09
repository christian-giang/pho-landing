import crypto from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Owner (restaurant) authentication for the /admin editor.
 *
 * There is no database here: the password lives in the environment as a scrypt
 * hash (`OWNER_PASSWORD_HASH`, produced by `npm run hash-password`), and a
 * session is an HMAC cookie bound to that hash — so rotating the password
 * invalidates every existing session automatically.
 */

const COOKIE = "pho_owner";
const MAX_AGE_SEC = 60 * 60 * 24 * 30;

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function ownerHash(): string | null {
  return process.env.OWNER_PASSWORD_HASH || null;
}

function cookieSecret(): string {
  const s = process.env.COOKIE_SECRET;
  if (!s) throw new Error("COOKIE_SECRET is not set");
  return s;
}

/** scrypt password hash, stored as "saltHex:hashHex". */
export function hashOwnerPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyOwnerPassword(password: string): boolean {
  const stored = ownerHash();
  if (!stored) return false;
  const idx = stored.indexOf(":");
  if (idx < 0) return false;
  try {
    const salt = Buffer.from(stored.slice(0, idx), "hex");
    const expected = Buffer.from(stored.slice(idx + 1), "hex");
    const actual = crypto.scryptSync(password, salt, expected.length);
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function signCookie(): string {
  return crypto
    .createHmac("sha256", cookieSecret())
    .update(`owner:${ownerHash()}`)
    .digest("base64url");
}

/** True only for a valid owner cookie bound to the current password hash. */
export function isOwner(req: VercelRequest): boolean {
  if (!ownerHash()) return false;
  const value = req.cookies?.[COOKIE];
  if (!value) return false;
  try {
    return timingSafeEqualStr(value, signCookie());
  } catch {
    return false;
  }
}

export function setOwnerCookie(res: VercelResponse): void {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${signCookie()}; Path=/; Max-Age=${MAX_AGE_SEC}; HttpOnly; SameSite=Lax; Secure`,
  );
}

export function clearOwnerCookie(res: VercelResponse): void {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`);
}

/** Guard for every owner-only handler; sends 401 itself and returns false. */
export function requireOwner(req: VercelRequest, res: VercelResponse): boolean {
  if (isOwner(req)) return true;
  res.status(401).json({ ok: false, error: "Nicht angemeldet." });
  return false;
}
