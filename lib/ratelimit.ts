/**
 * Tiny in-process fixed-window rate limiter.
 *
 * NOTE ON SERVERLESS: unlike the long-lived server this was ported from, each
 * warm Vercel instance keeps its own Map, so the effective limit is (instances
 * × max) and a cold start resets the window. That is deliberate — it is a
 * cheap brake on a single abusive client, not a security boundary. The real
 * defences are the honeypot field on the reservation form and the scrypt
 * password on the admin. Swap in Vercel KV / Upstash here if this site ever
 * attracts enough traffic for it to matter.
 */

interface Bucket {
  count: number;
  resetAt: number; // epoch ms when the window rolls over
}

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

function sweep(now: number) {
  // Opportunistic GC so the map can't grow unbounded under attack.
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

/**
 * Record one hit against `key` and report whether it is within `max` hits per
 * `windowMs`. When over budget, `ok` is false and `retryAfterSec` says how long
 * until the window resets.
 */
export function rateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count += 1;

  const retryAfterSec = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
  if (b.count > max) {
    return { ok: false, remaining: 0, retryAfterSec };
  }
  return { ok: true, remaining: max - b.count, retryAfterSec };
}

/** Best-effort client IP from proxy headers (Vercel sets X-Forwarded-For). */
export function clientIp(req: { headers: Record<string, string | string[] | undefined> }): string {
  const xff = req.headers["x-forwarded-for"];
  const first = Array.isArray(xff) ? xff[0] : xff;
  if (first) return first.split(",")[0].trim();
  const real = req.headers["x-real-ip"];
  return (Array.isArray(real) ? real[0] : real)?.trim() || "unknown";
}
