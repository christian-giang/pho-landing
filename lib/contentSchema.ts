import { z } from "zod";

/**
 * Schema for the owner-editable content.json — the static website text
 * (hero, philosophy, evening teaser, contact/address, Impressum, tagline) that
 * sits alongside menu.json. Shared by the owner-admin save endpoint. Bounded
 * lengths keep a hostile payload from bloating the file. Mirrors the localized
 * idiom in lib/menuSchema.ts.
 */

const short = z.string().max(200);
const long = z.string().max(3000);
const localized = z.object({ de: long, en: long });

export const contentSchema = z.object({
  version: z.literal(1),
  brand: z.object({ tagline: localized }),
  contact: z.object({
    name: short,
    street: short,
    city: short,
    phoneDisplay: short,
    phoneShort: short,
    phoneHref: z.string().max(40),
  }),
  hero: z.object({
    eyebrow: localized,
    title: localized,
    lead: localized,
    ctaReserve: localized,
    ctaHours: localized,
  }),
  philosophy: z.object({
    quote: localized,
    copy1: localized,
    copy2: localized,
    pron: localized,
    explainerBody: localized,
  }),
  evening: z.object({
    title: localized,
    lead: localized,
    copy: localized,
    hoursLine: localized,
  }),
  contactSection: z.object({
    title: localized,
    sub: localized,
    addressLabel: localized,
    phoneLabel: localized,
    hint: localized,
    hoursLabel: localized,
  }),
  impressum: z.object({
    title: localized,
    owner: short,
    vatId: short,
    legal: z.array(z.object({ heading: localized, text: localized })).max(6),
  }),
});

export type Content = z.infer<typeof contentSchema>;
