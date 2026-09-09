import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  clearOwnerCookie,
  isOwner,
  setOwnerCookie,
  verifyOwnerPassword,
} from "../lib/auth.js";
import { rateLimit, clientIp } from "../lib/ratelimit.js";

/**
 * Owner login for /admin.
 *   GET    -> { ok: true } when the caller already holds a valid session
 *   POST   -> { password } sets the session cookie
 *   DELETE -> logs out
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    return res.status(isOwner(req) ? 200 : 401).json({ ok: isOwner(req) });
  }

  if (req.method === "DELETE") {
    clearOwnerCookie(res);
    return res.status(200).json({ ok: true });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ ok: false });
  }

  const rl = rateLimit(`owner-login:${clientIp(req)}`, 10, 5 * 60 * 1000);
  if (!rl.ok) {
    res.setHeader("Retry-After", String(rl.retryAfterSec));
    return res.status(429).json({
      ok: false,
      error: "Zu viele Versuche. Bitte später erneut versuchen.",
    });
  }

  if (!process.env.OWNER_PASSWORD_HASH) {
    return res.status(503).json({ ok: false, error: "Admin ist nicht eingerichtet." });
  }

  const password = String((req.body as { password?: unknown } | undefined)?.password ?? "");
  if (!password || !verifyOwnerPassword(password)) {
    return res.status(401).json({ ok: false });
  }

  setOwnerCookie(res);
  return res.status(200).json({ ok: true });
}
