/**
 * Reservation email settings.
 *
 * On the builder these lived in a per-project `reservation.env` file on disk;
 * here they are plain Vercel environment variables. Same four values, same
 * meaning — see .env.example.
 */
export interface ReservationConfig {
  apiKey: string;
  /** RFC5322 "Name <addr>" sender; must be a Resend-verified sender. */
  from: string;
  to: string;
  toName: string;
}

/** Returns the config, or null when any required variable is missing. */
export function readReservationConfig(): ReservationConfig | null {
  const apiKey = process.env.RESEND_API_KEY || "";
  const from = process.env.MAIL_FROM || "";
  const to = process.env.RESERVATION_TO || "";
  if (!apiKey || !from || !to) return null;
  return { apiKey, from, to, toName: process.env.RESERVATION_TO_NAME || "" };
}
