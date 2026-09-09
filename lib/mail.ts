import { Resend } from "resend";
import type { ReservationConfig } from "./reservationConfig.js";

/**
 * Sends the two reservation emails via Resend: a request to the restaurant and
 * an auto-reply confirmation to the guest. Called from /api/reserve after
 * validation. All guest-supplied text is HTML-escaped.
 *
 * The HTML is table-based with fully inline styles so it renders consistently
 * across email clients (Gmail, Outlook, Apple Mail). No external images/fonts.
 */

export interface ReservationData {
  name: string;
  phone: string;
  email: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  guests: number;
  message?: string;
}

export type MailResult = { ok: true } | { ok: false; error: string };

// Brand palette (mirrors the site's :root tokens).
const C = {
  olive: "#2B2D10",
  chartreuse: "#C6CE28",
  gold: "#B9A94B",
  goldDeep: "#7A6E2C",
  magenta: "#D6528B",
  magentaD: "#B33A6F",
  ink: "#2B2D10",
  inkSoft: "#4A4C33",
  paper: "#EEECDD",
  line: "#E4E2D2",
  tint: "#F7F8EE",
  noteBg: "#FBEFF4",
  noteInk: "#8A2F57",
};

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "Arial, Helvetica, sans-serif";

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(date: string, lang: "de" | "en"): string {
  const [y, m, d] = date.split("-");
  if (!y || !m || !d) return date;
  return lang === "de" ? `${d}.${m}.${y}` : `${y}-${m}-${d}`;
}

/** Full branded email document wrapping the card body. */
function shell(opts: {
  preheader: string;
  headerSub: string;
  inner: string;
  footer: string;
}): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
</head>
<body style="margin:0;padding:0;background:${C.paper};">
<span style="display:none!important;max-height:0;overflow:hidden;opacity:0;color:${C.paper};">${esc(
    opts.preheader,
  )}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.paper};">
  <tr><td align="center" style="padding:26px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:#FFFFFF;border:1px solid ${C.line};border-radius:8px;overflow:hidden;">
      <tr>
        <td style="background:${C.olive};padding:24px 34px;">
          <div style="font-family:${SERIF};font-style:italic;font-weight:normal;font-size:28px;line-height:1;color:${C.chartreuse};">phở</div>
          <div style="font-family:${SANS};font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:${C.gold};margin-top:7px;">&#9733;&nbsp; ${esc(
            opts.headerSub,
          )}</div>
        </td>
      </tr>
      <tr><td style="padding:32px 34px 30px;">${opts.inner}</td></tr>
      <tr>
        <td style="background:${C.tint};border-top:1px solid ${C.line};padding:16px 34px;font-family:${SANS};font-size:12px;line-height:1.5;color:${C.inkSoft};">${opts.footer}</td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function heading(title: string): string {
  return `<div style="font-family:${SERIF};font-size:22px;color:${C.goldDeep};margin:0 0 8px;">${esc(
    title,
  )}</div>
<div style="height:3px;width:46px;background:${C.chartreuse};margin:0 0 18px;font-size:0;line-height:0;">&nbsp;</div>`;
}

function lead(text: string): string {
  return `<p style="font-family:${SANS};font-size:15px;line-height:1.6;color:${C.inkSoft};margin:0 0 4px;">${text}</p>`;
}

/** rows: [label, valueHtml] — valueHtml is already safe (caller escapes). */
function detailTable(rows: [string, string][]): string {
  const trs = rows
    .map(
      ([k, v], i) => `<tr>
        <td style="padding:10px 14px 10px 0;${
          i < rows.length - 1 ? `border-bottom:1px solid ${C.line};` : ""
        }font-family:${SANS};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.goldDeep};width:38%;vertical-align:top;">${esc(
          k,
        )}</td>
        <td style="padding:10px 0;${
          i < rows.length - 1 ? `border-bottom:1px solid ${C.line};` : ""
        }font-family:${SANS};font-size:15px;line-height:1.5;color:${C.ink};font-weight:bold;">${v}</td>
      </tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:20px 0 4px;">${trs}</table>`;
}

function noteBox(text: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 0;">
    <tr><td style="background:${C.noteBg};border-left:3px solid ${C.magenta};padding:13px 16px;font-family:${SANS};font-size:13px;line-height:1.55;color:${C.noteInk};">${text}</td></tr>
  </table>`;
}

function link(href: string, label: string): string {
  return `<a href="${esc(href)}" style="color:${C.magentaD};text-decoration:none;">${esc(label)}</a>`;
}

function restaurantHtml(cfg: ReservationConfig, d: ReservationData): string {
  const rows: [string, string][] = [
    ["Name", esc(d.name)],
    ["Telefon", link("tel:" + d.phone.replace(/\s+/g, ""), d.phone)],
    ["E-Mail", link("mailto:" + d.email, d.email)],
    ["Datum", esc(fmtDate(d.date, "de"))],
    ["Uhrzeit", esc(d.time) + " Uhr"],
    ["Personen", esc(String(d.guests))],
  ];
  if (d.message) rows.push(["Anmerkung", esc(d.message)]);

  const inner =
    heading("Neue Reservierungsanfrage") +
    lead("Über die Website ist eine neue Reservierungsanfrage eingegangen.") +
    detailTable(rows) +
    noteBox(
      `Antworten Sie einfach auf diese E-Mail, um dem Gast direkt zu schreiben, oder rufen Sie unter ${link(
        "tel:" + d.phone.replace(/\s+/g, ""),
        d.phone,
      )} zurück.`,
    );

  return shell({
    preheader: `${d.name} · ${fmtDate(d.date, "de")} ${d.time} · ${d.guests} P.`,
    headerSub: cfg.toName || "Reservierung",
    inner,
    footer: "Automatische Benachrichtigung Ihrer Restaurant-Website.",
  });
}

function guestHtml(cfg: ReservationConfig, d: ReservationData, lang: "de" | "en"): string {
  const de = lang === "de";
  const rows: [string, string][] = [
    [de ? "Datum" : "Date", esc(fmtDate(d.date, lang))],
    [de ? "Uhrzeit" : "Time", esc(d.time) + (de ? " Uhr" : "")],
    [de ? "Personen" : "Guests", esc(String(d.guests))],
  ];
  if (d.message) rows.push([de ? "Anmerkung" : "Note", esc(d.message)]);

  const restaurant = esc(cfg.toName || "Phở Restaurant");
  const inner =
    heading(de ? "Vielen Dank für Ihre Anfrage" : "Thank you for your request") +
    lead(
      de
        ? `Liebe/r ${esc(
            d.name,
          )}, wir haben Ihre Reservierungsanfrage erhalten und bestätigen sie in Kürze telefonisch.`
        : `Dear ${esc(
            d.name,
          )}, we have received your reservation request and will confirm it by phone shortly.`,
    ) +
    detailTable(rows) +
    noteBox(
      de
        ? "Dies ist eine automatische Empfangsbestätigung und noch keine verbindliche Reservierung. Bei Fragen antworten Sie einfach auf diese E-Mail."
        : "This is an automatic acknowledgement of receipt, not a confirmed booking yet. If you have any questions, simply reply to this email.",
    );

  return shell({
    preheader: de
      ? "Wir haben Ihre Reservierungsanfrage erhalten."
      : "We have received your reservation request.",
    headerSub: de ? "Spezialitäten aus Vietnam" : "Specialties from Vietnam",
    inner,
    footer: (de ? "Wir freuen uns auf Ihren Besuch. — " : "We look forward to your visit. — ") + restaurant,
  });
}

/** Rendered emails (exported for previewing/testing without sending). */
export function renderReservationEmails(
  cfg: ReservationConfig,
  data: ReservationData,
  lang: "de" | "en",
) {
  return {
    restaurantSubject: `Neue Reservierungsanfrage – ${data.name}, ${fmtDate(
      data.date,
      "de",
    )} ${data.time} (${data.guests} P.)`,
    restaurantHtml: restaurantHtml(cfg, data),
    guestSubject:
      lang === "en"
        ? `Your reservation request${cfg.toName ? ` – ${cfg.toName}` : ""}`
        : `Ihre Reservierungsanfrage${cfg.toName ? ` – ${cfg.toName}` : ""}`,
    guestHtml: guestHtml(cfg, data, lang),
  };
}

export async function sendReservationEmails(
  cfg: ReservationConfig,
  data: ReservationData,
  lang: "de" | "en",
): Promise<MailResult> {
  const resend = new Resend(cfg.apiKey);
  const mail = renderReservationEmails(cfg, data, lang);

  try {
    const toRestaurant = await resend.emails.send({
      from: cfg.from,
      to: cfg.to,
      replyTo: data.email,
      subject: mail.restaurantSubject,
      html: mail.restaurantHtml,
    });
    if (toRestaurant.error) {
      return { ok: false, error: toRestaurant.error.message };
    }

    // Guest auto-reply is best-effort: the restaurant already has the request,
    // so a failure here shouldn't fail the whole submission.
    await resend.emails
      .send({
        from: cfg.from,
        to: data.email,
        replyTo: cfg.to,
        subject: mail.guestSubject,
        html: mail.guestHtml,
      })
      .catch(() => undefined);

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
