import fs from "node:fs";
import path from "node:path";
import chromiumPack from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { loc, formatPrice, formatSize, type Menu, type MenuLang } from "./menuSchema.js";

/**
 * Renders menu.json into print-ready Abendkarte PDFs (DE + EN), mimicking the
 * restaurant's original professionally designed print menu: A5 portrait,
 * frangipani cover, yellow-green category headings, olive notes box, magenta
 * closing page with opening hours. Regenerated on every menu edit so the
 * downloadable PDFs can never go stale.
 *
 * Ported from the builder's Playwright version. Two things changed and nothing
 * else — the markup and CSS below are untouched, which is what keeps the output
 * identical:
 *   1. The browser is puppeteer-core driving @sparticuz/chromium, the Chromium
 *      build that fits inside a Vercel function.
 *   2. Fonts are embedded from fonts/ instead of being pulled from Google Fonts
 *      mid-render. A serverless Chromium ships with no system fonts at all, so
 *      a failed font request would have meant a PDF full of tofu boxes.
 *
 * Photos are read from public/assets/print/ (extracted once from the original
 * print PDF) and inlined as data URIs; missing photos degrade to plain colored
 * pages instead of failing the run.
 */

/** Resolve a repo directory from inside a bundled function. */
function repoDir(name: string): string | null {
  const candidates = [
    path.join(process.cwd(), name),
    path.join(import.meta.dirname, "..", name),
    path.join(import.meta.dirname, "..", "..", name),
  ];
  return candidates.find((c) => fs.existsSync(c)) ?? null;
}

interface FontFace {
  file: string;
  family: string;
  weight: string;
  style: string;
  /** Google's own descriptor block, minus src — see scripts/fetch-fonts.mjs. */
  descriptors: string;
}

/**
 * The @font-face rules that replace the original's Google Fonts <link>. The
 * descriptors are Google's verbatim (weights, font-stretch, unicode-range), so
 * the browser resolves exactly the same face for a given run of text as it did
 * on the builder — which is what keeps line breaks where they were.
 */
let fontCssCache: string | null = null;

function fontFaceCss(): string {
  if (fontCssCache !== null) return fontCssCache;
  const dir = repoDir("fonts");
  if (!dir) return (fontCssCache = "");
  let faces: FontFace[];
  try {
    faces = JSON.parse(fs.readFileSync(path.join(dir, "faces.json"), "utf8"));
  } catch {
    return (fontCssCache = "");
  }
  fontCssCache = faces
    .map((f) => {
      let b64: string;
      try {
        b64 = fs.readFileSync(path.join(dir, f.file)).toString("base64");
      } catch {
        return "";
      }
      const src = `src:url(data:font/woff2;base64,${b64}) format('woff2')`;
      return `@font-face{${f.descriptors};${src};}`;
    })
    .filter(Boolean)
    .join("\n");
  return fontCssCache;
}

const PDF_FILES: Record<MenuLang, string> = {
  de: "abendkarte.pdf",
  en: "abendkarte-en.pdf",
};

/** Static print-only copy that is not owner-editable (from the original menu). */
const COPY = {
  de: {
    coverSub: "Spezialitäten<br>aus Vietnam",
    philQuote: "In Vietnam musst du das Essen nicht suchen, es sucht dich.",
    philPron: "(„fo“ ausgesprochen)",
    philExplainer:
      "ist eine traditionelle Suppe und das Nationalgericht Vietnams. Sie ist fast an jeder Straßenecke erhältlich und wird gerne zum Frühstück, aber auch zu Mittag und zu Abend gegessen. Die Suppe wird in einer Schüssel serviert und enthält neben einer kräftigen Brühe Reisnudeln und dünn geschnittenes Rind- oder Hühnerfleisch. Sie kann mit frischen Kräutern und Fischsauce nach Belieben gewürzt werden.",
    philBody:
      "Essen ist in Vietnam wesentlich mehr als die reine Nahrungsaufnahme, es ist eine hohe Lebenskunst. Die vietnamesische Küche zählt daher zu den vielfältigsten, leichtesten und gesündesten der Welt. Die Grundpfeiler sind Reis, die Fischsoße „nuoc mam“ und frische Kräuter. Wir kochen stets mit frischen Zutaten. Fette werden bei uns nur sparsam verwendet.",
    vegetarian: "vegetarisch",
    vegan: "vegan",
    questions: "Falls Sie noch Fragen haben, wenden Sie sich bitte an uns.",
    hoursTitle: "Öffnungszeiten",
    vat: "Alle Preise inklusive Mehrwertsteuer.",
    lunchPointer: "Aktuelles Mittagsmenü unter<br>www.pho-konstanz.de",
    restaurantSub: "Spezialitäten aus Vietnam",
    owner: "Inhaber",
  },
  en: {
    coverSub: "Specialties<br>from Vietnam",
    philQuote: "In Vietnam you don't have to search for food, it searches for you.",
    philPron: "(pronounced “fo”)",
    philExplainer:
      "is a traditional soup and the national dish of Vietnam. It is available at almost every street corner and is commonly eaten for breakfast, but also for lunch and dinner. The soup is served in a bowl and, besides a rich broth, contains rice noodles and thinly sliced beef or chicken. It can be seasoned to taste with fresh herbs and fish sauce.",
    philBody:
      "Food in Vietnam is much more than mere nourishment; it is a high art of living. Vietnamese cuisine is therefore among the most diverse, light and healthy in the world. The cornerstones are rice, the fish sauce “nuoc mam” and fresh herbs. We always cook with fresh ingredients. Fat is used only sparingly.",
    vegetarian: "vegetarian",
    vegan: "vegan",
    questions: "If you still have questions, please contact us.",
    hoursTitle: "Opening hours",
    vat: "All prices include VAT.",
    lunchPointer: "Current lunch menu at<br>www.pho-konstanz.de",
    restaurantSub: "Vietnamese specialties",
    owner: "Owner",
  },
} as const;

const CONTACT_HTML =
  "Phở Restaurant<br>Hindenburgstraße 15<br>D&nbsp;–&nbsp;78467 Konstanz<br>Telefon 0049&nbsp;(0)7531&nbsp;/&nbsp;697&nbsp;05&nbsp;55<br>www.pho-konstanz.de";
const OWNER_NAME = "Luong Tam Giang";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function dataUri(file: string): string | null {
  try {
    const buf = fs.readFileSync(file);
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function marksHtml(marks: string[]): string {
  if (!marks.length) return "";
  return ` <sup class="marks">${marks.map((m) => esc(m) + ")").join(" ")}</sup>`;
}

function tagHtml(tags: string[], lang: MenuLang): string {
  return tags
    .map((t) => `<span class="tag">${t === "vegan" ? COPY[lang].vegan : COPY[lang].vegetarian}</span>`)
    .join(" ");
}

const ROUNDEL_SVG = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="50" fill="#C6CE28"/>
  <text x="50" y="54" text-anchor="middle" font-family="Lora, Georgia, serif" font-style="italic" font-weight="500" font-size="33" fill="#FFFFFF">phở</text>
  <g stroke="#FFFFFF" stroke-width="4" stroke-linecap="round">
    <line x1="24" y1="78" x2="86" y2="60"/>
    <line x1="21" y1="69" x2="83" y2="51"/>
  </g>
</svg>`;

function buildHtml(
  menu: Menu,
  lang: MenuLang,
  img: Record<string, string | null>,
  fonts: string,
): string {
  const C = COPY[lang];

  const categoriesHtml = menu.dinner.categories
    .map((cat, ci) => {
      const subs = cat.subcategories
        .map((sub) => {
          const dishes = sub.dishes
            .map((d) => {
              const name = esc(loc(d.name, lang));
              const desc = d.desc ? esc(loc(d.desc, lang)) : "";
              return `<div class="dish">
                <span class="no">${esc(d.no)}</span>
                <span class="dish-main"><strong>${name}</strong>${marksHtml(d.marks)}${
                  d.tags.length ? " " + tagHtml(d.tags, lang) : ""
                }${desc ? `<span class="desc">${desc}</span>` : ""}</span>
                <span class="price">${d.price != null ? formatPrice(d.price, lang) : ""}</span>
              </div>`;
            })
            .join("");
          return `<div class="subcategory">
            ${sub.title ? `<h3>${esc(loc(sub.title, lang))}</h3>` : ""}
            ${sub.intro ? `<p class="intro">${esc(loc(sub.intro, lang))}</p>` : ""}
            ${dishes}
          </div>`;
        })
        .join("");
      // big categories start on a fresh page like the print original; small
      // ones (dessert, kids) flow onto the previous page's free space
      const dishCount = cat.subcategories.reduce((n, s) => n + s.dishes.length, 0);
      const cls = ci > 0 && dishCount > 4 ? " category-next" : " category-keep";
      return `<section class="category${cls}">
        <h2>${esc(loc(cat.title, lang))}</h2>
        ${subs}
      </section>`;
    })
    .join("");

  const drinksHtml = menu.dinner.drinks.groups
    .map((g) => {
      if (g.sizes) {
        const head = g.sizes.map((s) => `<th>${esc(formatSize(s, lang))}</th>`).join("");
        const rows = g.items
          .map(
            (it) => `<tr><td class="dn">${esc(loc(it.name, lang))}${marksHtml(it.marks)}</td>${(it.prices ?? [])
              .map((p) => `<td class="dp">${p != null ? formatPrice(p, lang) : "–"}</td>`)
              .join("")}</tr>`,
          )
          .join("");
        return `<div class="subcategory"><h3>${esc(loc(g.title, lang))}</h3>
          <table class="drinks"><thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
      }
      const rows = g.items
        .map(
          (it) => `<tr><td class="dn">${esc(loc(it.name, lang))}${marksHtml(it.marks)}</td>
            <td class="ds">${esc(formatSize(it.size ?? null, lang))}</td>
            <td class="dp">${it.price != null ? formatPrice(it.price, lang) : ""}</td></tr>`,
        )
        .join("");
      return `<div class="subcategory"><h3>${esc(loc(g.title, lang))}</h3>
        <table class="drinks"><tbody>${rows}</tbody></table></div>`;
    })
    .join("");

  const notesHtml = menu.dinner.notes
    .map((n) => `<p><span class="star">★</span>${esc(loc(n.text, lang))}</p>`)
    .join("");

  const legendHtml = `
    <div class="legend-col"><h3>${esc(loc(menu.dinner.legend.additivesTitle, lang))}</h3>
      ${menu.dinner.legend.additives.map((a) => `<p><b>${esc(a.key)})</b> ${esc(loc(a.label, lang))}</p>`).join("")}
    </div>
    <div class="legend-col"><h3>${esc(loc(menu.dinner.legend.allergensTitle, lang))}</h3>
      ${menu.dinner.legend.allergens.map((a) => `<p><b>${esc(a.key)})</b> ${esc(loc(a.label, lang))}</p>`).join("")}
    </div>`;

  const hoursHtml = menu.hours.rows
    .map((row) => {
      const lines = row.lines
        .map((l) => `${esc(loc(l.time, lang))}${l.note ? ` <span class="hnote">${esc(loc(l.note, lang))}</span>` : ""}`)
        .join("<br>");
      return `<p class="hrow"><strong>${esc(loc(row.days, lang))}</strong><br>${lines}</p>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<style>${fonts}</style>
<style>
  :root {
    --leaf: #BCC918;      /* yellow-green headings, as in the print original */
    --leaf-deep: #8E9A0F;
    --magenta: #D6247E;   /* fine print + closing page */
    --olive-box: #7C8A41; /* green notes box */
    --ink: #3A3A33;
    --ink-soft: #63635A;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: 148mm 210mm; margin: 15mm 13mm 16mm; }
  @page bleed { margin: 0; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: "Nunito Sans", Verdana, sans-serif; font-size: 9pt; color: var(--ink); line-height: 1.45; }

  .page-bleed { page: bleed; width: 148mm; height: 210mm; position: relative; overflow: hidden; break-after: page; }
  .page-bleed img.bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }

  /* ---- Cover ---- */
  .cover { background: #435A22; }
  .cover .roundel { position: absolute; top: 12mm; left: 12mm; width: 34mm; height: 34mm; }
  .cover .cover-foot { position: absolute; left: 12mm; bottom: 16mm; }
  .cover .cover-foot .star { color: var(--leaf); font-size: 16pt; display: block; text-align: center; margin-bottom: 2mm; text-shadow: 0 0 2mm rgba(0,0,0,0.35); }
  /* White type straight on the photo (like the original card) — no box. */
  .cover .cover-sub { color: #fff; font-size: 13.5pt; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; line-height: 1.5; text-shadow: 0 0 2mm rgba(0,0,0,0.4); }

  /* ---- Philosophy ---- */
  .phil { background: #F4F1E7; }
  .phil .overlay { position: absolute; inset: 0; background: linear-gradient(105deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.86) 45%, rgba(255,255,255,0.94) 100%); }
  .phil .inner { position: absolute; inset: 0; padding: 14mm 13mm; }
  .phil .snap { position: absolute; top: 14mm; right: 13mm; width: 46mm; border: 1.2mm solid #fff; box-shadow: 0 2mm 5mm rgba(0,0,0,0.18); }
  .phil .pho-word { font-family: "Lora", Georgia, serif; font-style: italic; color: var(--magenta); font-size: 22pt; margin: 34mm 0 3mm; }
  .phil .pron { font-size: 8.5pt; color: var(--ink-soft); font-style: normal; }
  .phil .explainer { max-width: 72mm; margin-left: 42mm; }
  .phil .body { max-width: 106mm; margin-top: 14mm; }
  .phil .slogan { position: absolute; right: 13mm; bottom: 14mm; max-width: 80mm; text-align: right; color: var(--magenta); font-weight: 700; font-size: 9.5pt; letter-spacing: 0.08em; text-transform: uppercase; }

  /* ---- Menu flow pages ---- */
  .category-next { break-before: page; }
  .category-keep { break-inside: avoid; margin-top: 8mm; }
  .category h2 { font-family: "Lora", Georgia, serif; font-weight: 500; font-size: 19pt; color: var(--leaf); margin: 0 0 5mm; }
  .subcategory { break-inside: avoid; margin-bottom: 5mm; }
  .subcategory h3 { font-family: "Lora", Georgia, serif; font-weight: 500; font-size: 12pt; color: var(--leaf-deep); margin: 4mm 0 1.5mm; }
  .intro { color: var(--ink-soft); margin-bottom: 2.5mm; }
  .dish { display: flex; align-items: baseline; gap: 2.5mm; padding: 1.6mm 0; break-inside: avoid; }
  .dish .no { font-weight: 800; min-width: 5.5mm; }
  .dish .dish-main { flex: 1; }
  .dish .dish-main strong { font-weight: 800; }
  .dish .desc { display: block; color: var(--ink-soft); }
  .dish .price { font-weight: 800; white-space: nowrap; }
  .marks { font-size: 6.5pt; color: var(--ink-soft); }
  .tag { display: inline-block; background: var(--leaf); color: #fff; border-radius: 99px; font-size: 6.5pt; font-weight: 700; padding: 0.2mm 2mm; vertical-align: 1px; }

  table.drinks { width: 100%; border-collapse: collapse; }
  table.drinks th, table.drinks td { padding: 1.2mm 1mm; text-align: right; vertical-align: baseline; }
  table.drinks thead th { color: var(--leaf-deep); font-family: "Lora", Georgia, serif; font-size: 9.5pt; font-weight: 500; }
  table.drinks .dn { text-align: left; }
  table.drinks .dp, table.drinks .ds { white-space: nowrap; font-weight: 700; }
  table.drinks .ds { color: var(--ink-soft); font-weight: 400; }

  .notes-box { break-inside: avoid; background: var(--olive-box); color: #fff; padding: 4mm 5mm; margin: 6mm 0; }
  .notes-box p { margin: 1.2mm 0; }
  .notes-box .star { color: var(--leaf); margin-right: 2mm; }

  .legend-page { break-before: page; }
  .legend-page h3 { font-family: "Lora", Georgia, serif; font-weight: 500; font-size: 13pt; margin: 6mm 0 2mm; }
  .legend-col p { font-size: 8pt; margin: 0.8mm 0; }
  .questions { color: var(--magenta); font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; margin-top: 12mm; font-size: 8.5pt; }

  /* ---- Closing (hours) ---- */
  .closing { background: var(--magenta); color: #fff; }
  .closing .inner { position: absolute; inset: 0; padding: 16mm 14mm; }
  .closing h2 { font-family: "Lora", Georgia, serif; font-weight: 500; font-size: 24pt; color: var(--leaf); margin-bottom: 10mm; }
  .closing .hrow { margin-bottom: 4mm; }
  .closing .hnote { opacity: 0.85; }
  .closing .vat { margin-top: 4mm; font-size: 8.5pt; opacity: 0.9; }
  .closing .pointer { margin-top: 6mm; color: var(--leaf); font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; font-size: 9.5pt; }
  .closing .contact { position: absolute; left: 14mm; bottom: 18mm; font-size: 9pt; line-height: 1.6; }
  .closing .contact .rest { font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 3mm; }
  .closing .fruit { position: absolute; right: 14mm; bottom: 42mm; width: 42mm; height: 42mm; border-radius: 50%; object-fit: cover; }
  .closing .star { position: absolute; left: 14mm; bottom: 8mm; color: var(--leaf); font-size: 16pt; }
</style>
</head>
<body>

<div class="page-bleed cover">
  ${img.cover ? `<img class="bg" src="${img.cover}" alt="">` : ""}
  <div class="roundel">${ROUNDEL_SVG}</div>
  <div class="cover-foot">
    <span class="star">★</span>
    <div class="cover-sub">${C.coverSub}</div>
  </div>
</div>

<div class="page-bleed phil">
  ${img.ginger ? `<img class="bg" src="${img.ginger}" alt="">` : ""}
  <div class="overlay"></div>
  <div class="inner">
    ${img.streetfood ? `<img class="snap" src="${img.streetfood}" alt="">` : ""}
    <p class="pho-word">phở <span class="pron">${C.philPron}</span></p>
    <p class="explainer">… ${C.philExplainer}</p>
    <p class="body">${C.philBody}</p>
    <p class="slogan">${C.philQuote}</p>
  </div>
</div>

${categoriesHtml}

<section class="category category-next">
  <h2>${esc(loc(menu.dinner.drinks.title, lang))}</h2>
  ${drinksHtml}
</section>

<section class="legend-page">
  <div class="notes-box">${notesHtml}</div>
  ${legendHtml}
  <p class="questions">${C.questions}</p>
</section>

<div class="page-bleed closing">
  <div class="inner">
    <h2>${C.hoursTitle}</h2>
    ${hoursHtml}
    <p class="vat">${esc(loc(menu.hours.kitchenNote, lang))} ${C.vat}</p>
    <p class="pointer">${C.lunchPointer}</p>
    ${img.dragonfruit ? `<img class="fruit" src="${img.dragonfruit}" alt="">` : ""}
    <div class="contact">
      <p class="rest">Phở Restaurant<br><span style="font-weight:400">${C.restaurantSub}</span></p>
      <p>${CONTACT_HTML}</p>
      <p style="margin-top:3mm">${C.owner}:<br>${OWNER_NAME}</p>
    </div>
    <span class="star">★</span>
  </div>
</div>

</body>
</html>`;
}

export type MenuPdfResult =
  | { ok: true; pdfs: Record<MenuLang, Buffer> }
  | { ok: false; error: string };

/**
 * @sparticuz/chromium ships `--font-render-hinting=none`, which switches Blink
 * to sub-pixel glyph advances. The builder rendered these PDFs through
 * Playwright's chrome-headless-shell, which rounds advances to whole pixels —
 * a ~0.5% difference in text width, enough to move where several paragraphs
 * wrap. Forcing full hinting restores byte-for-byte identical line breaking.
 * Verified by measurement, not assumption; see scripts/render-pdf.ts.
 */
function launchArgs(): string[] {
  return chromiumPack.args.map((a) =>
    a === "--font-render-hinting=none" ? "--font-render-hinting=full" : a,
  );
}

/**
 * Launch Chromium. On Vercel that is the @sparticuz/chromium build; locally it
 * is whatever browser CHROME_PATH points at, so `npm run render-pdf` can
 * exercise this exact code path.
 *
 * For a local render that matches production, point CHROME_PATH at a
 * chrome-headless-shell binary. Full Chrome ignores --font-render-hinting in
 * its new headless mode and will wrap a few lines differently.
 */
async function launch() {
  const local = process.env.CHROME_PATH;
  if (local && !process.env.VERCEL) {
    return puppeteer.launch({
      executablePath: local,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=full"],
    });
  }
  return puppeteer.launch({
    args: launchArgs(),
    defaultViewport: chromiumPack.defaultViewport,
    executablePath: await chromiumPack.executablePath(),
    headless: true,
  });
}

/** Render both language PDFs from an already-validated menu. */
export async function renderMenuPdfs(menu: Menu): Promise<MenuPdfResult> {
  const printDir = repoDir(path.join("public", "assets", "print"));
  const img = {
    cover: printDir ? dataUri(path.join(printDir, "frangipani-cover.jpg")) : null,
    ginger: printDir ? dataUri(path.join(printDir, "ginger.jpg")) : null,
    streetfood: printDir ? dataUri(path.join(printDir, "streetfood.jpg")) : null,
    dragonfruit: printDir ? dataUri(path.join(printDir, "dragonfruit.jpg")) : null,
  };
  const fonts = fontFaceCss();

  const pdfs = {} as Record<MenuLang, Buffer>;
  let browser: Awaited<ReturnType<typeof launch>> | null = null;
  try {
    browser = await launch();
    for (const lang of ["de", "en"] as const) {
      const page = await browser.newPage();
      // Everything is inlined, so "load" is enough — there is nothing to wait
      // on the network for (the Playwright original needed "networkidle" only
      // because it fetched Google Fonts).
      await page.setContent(buildHtml(menu, lang, img, fonts), { waitUntil: "load" });
      await page
        .evaluate(() => (document as Document & { fonts: FontFaceSet }).fonts.ready)
        .catch(() => {});
      const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
      await page.close();
      pdfs[lang] = Buffer.from(pdf);
    }
    return { ok: true, pdfs };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await browser?.close().catch(() => {});
  }
}

/** Output filename for each language, as referenced by the website. */
export { PDF_FILES };
