import { z } from "zod";

/**
 * Schema for the owner-editable menu.json. Shared by the PDF generator, the
 * owner-admin save endpoint and the admin UI so all three validate the exact
 * same shape. All human-readable strings are bounded to keep a hostile
 * owner-admin payload from bloating the file.
 */

const short = z.string().max(300);
const long = z.string().max(2000);

/** Localized string. Dish names are often Vietnamese and language-neutral,
 *  so fields that allow it accept a plain string too. */
const localized = z.object({ de: long, en: long });
const nameField = z.union([short, z.object({ de: short, en: short })]);
const price = z.number().min(0).max(999);

const dish = z.object({
  no: z.string().max(4),
  name: nameField,
  tags: z.array(z.enum(["vegan", "vegetarisch"])).max(4),
  marks: z.array(z.string().max(3)).max(10),
  desc: localized.nullable(),
  price: price.nullable(),
});

const subcategory = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  title: localized.nullable(),
  intro: localized.nullable(),
  dishes: z.array(dish).max(60),
});

const category = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  title: localized,
  subcategories: z.array(subcategory).max(12),
});

const drinkItem = z.object({
  name: nameField,
  marks: z.array(z.string().max(3)).max(10),
  /** aligned with the group's `sizes` when that is set */
  prices: z.array(price.nullable()).max(6).optional(),
  /** used when the group has no `sizes` */
  size: z.string().max(20).nullable().optional(),
  price: price.optional(),
});

const drinkGroup = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,40}$/),
    title: localized,
    sizes: z.array(z.string().max(20)).max(6).nullable(),
    items: z.array(drinkItem).max(60),
  })
  .superRefine((g, ctx) => {
    for (const [i, item] of g.items.entries()) {
      if (g.sizes) {
        if (!item.prices || item.prices.length !== g.sizes.length) {
          ctx.addIssue({
            code: "custom",
            path: ["items", i, "prices"],
            message: "prices must align with the group's sizes",
          });
        }
      } else if (typeof item.price !== "number") {
        ctx.addIssue({
          code: "custom",
          path: ["items", i, "price"],
          message: "price required in a group without sizes",
        });
      }
    }
  });

const legendEntry = z.object({ key: z.string().max(3), label: localized });

export const menuSchema = z.object({
  version: z.literal(1),
  lunch: z.object({
    subtitle: localized,
    starter: z.object({ title: localized, desc: localized, price }),
    dishes: z.array(dish).max(20),
    note: localized,
  }),
  dinner: z.object({
    title: localized,
    subtitle: localized,
    categories: z.array(category).max(12),
    drinks: z.object({
      title: localized,
      groups: z.array(drinkGroup).max(12),
    }),
    legend: z.object({
      additivesTitle: localized,
      additives: z.array(legendEntry).max(20),
      allergensTitle: localized,
      allergens: z.array(legendEntry).max(20),
    }),
    notes: z
      .array(z.object({ id: z.string().regex(/^[a-z0-9-]{1,40}$/), text: localized }))
      .max(10),
    pdfs: z
      .array(
        z.object({
          file: z.string().regex(/^assets\/[a-z0-9-]{1,60}\.pdf$/),
          label: localized,
        }),
      )
      .max(4),
  }),
  hours: z.object({
    rows: z
      .array(
        z.object({
          days: localized,
          lines: z
            .array(z.object({ time: localized, note: localized.nullable() }))
            .max(4),
        }),
      )
      .max(8),
    kitchenNote: localized,
  }),
});

export type Menu = z.infer<typeof menuSchema>;
export type MenuLang = "de" | "en";

/** Resolve a possibly-localized value for one language. */
export function loc(v: string | { de: string; en: string } | null | undefined, lang: MenuLang): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  return v[lang] ?? v.de ?? "";
}

export function formatPrice(n: number, lang: MenuLang): string {
  const s = n.toFixed(2);
  return (lang === "de" ? s.replace(".", ",") : s) + " €";
}

export function formatSize(s: string | null | undefined, lang: MenuLang): string {
  if (!s) return "";
  return lang === "en" ? s.replace(",", ".") : s;
}
