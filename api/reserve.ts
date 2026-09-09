import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { rateLimit, clientIp } from "../lib/ratelimit.js";
import { readReservationConfig } from "../lib/reservationConfig.js";
import { sendReservationEmails } from "../lib/mail.js";

/**
 * Reservation requests from the site's modal (public/reserve.js).
 *
 * Ported from the builder's /c/<id>/reserve route. The share-keyword cookie
 * check is gone — this site is public — so the abuse defences are the honeypot
 * field and the rate limiter.
 */

// Normalize a time to HH:MM, tolerating "9:30", "19:30:00", trailing text.
const timeField = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  const m = v.trim().match(/^(\d{1,2}):(\d{2})/);
  return m ? m[1].padStart(2, "0") + ":" + m[2] : v.trim();
}, z.string().regex(/^\d{2}:\d{2}$/));

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(1).max(40),
  email: z.string().trim().email().max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: timeField,
  guests: z.coerce.number().int().min(1).max(99),
  message: z.string().trim().max(1000).optional().default(""),
  lang: z.enum(["de", "en"]).default("de"),
  // Honeypot: real users never fill this hidden field.
  company: z.string().max(200).optional().default(""),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false });
  }

  const rl = rateLimit(`reserve:${clientIp(req)}`, 5, 10 * 60 * 1000);
  if (!rl.ok) {
    res.setHeader("Retry-After", String(rl.retryAfterSec));
    return res.status(429).json({
      ok: false,
      error: "Zu viele Anfragen. Bitte später erneut versuchen.",
    });
  }

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Bitte prüfen Sie Ihre Eingaben." });
  }
  const data = parsed.data;

  // Silent bot drop: pretend success so bots get no signal.
  if (data.company) return res.status(200).json({ ok: true });

  const cfg = readReservationConfig();
  if (!cfg) {
    return res.status(503).json({
      ok: false,
      error: "Reservierungen sind derzeit nicht verfügbar. Bitte rufen Sie uns an.",
    });
  }

  const result = await sendReservationEmails(
    cfg,
    {
      name: data.name,
      phone: data.phone,
      email: data.email,
      date: data.date,
      time: data.time,
      guests: data.guests,
      message: data.message || undefined,
    },
    data.lang,
  );

  if (!result.ok) {
    console.error("reservation send failed:", result.error);
    return res.status(502).json({
      ok: false,
      error: "Senden fehlgeschlagen. Bitte rufen Sie uns an.",
    });
  }
  return res.status(200).json({ ok: true });
}
