/* Downloads the webfonts the Abendkarte PDF needs into fonts/, so the renderer
   never depends on a network call to Google Fonts at request time.

   FIDELITY MATTERS HERE. The PDF must keep laying out exactly as it did on the
   builder, and glyph widths decide where every line wraps — so this does not
   pick weights by hand. It fetches the *exact same* CSS2 URL the original
   lib/menuPdf.ts had in its <head> and reproduces Google's @font-face blocks
   verbatim, with only the src: URL swapped for a data: URI. Variable-font axes
   (Nunito Sans carries an `opsz` axis), weight ranges and font-stretch
   descriptors therefore survive untouched.

   Both families are SIL Open Font License 1.1 — redistribution is permitted.
   Files and faces.json are committed; re-run only if the PDF's fonts change. */
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(import.meta.dirname, "..", "fonts");

/** Verbatim from the builder's lib/menuPdf.ts <head>. Do not "tidy" this. */
const CSS_URL =
  "https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Nunito+Sans:ital,opsz,wght@0,6..12,400;0,6..12,600;0,6..12,700&display=swap";

// A Chrome UA is required for Google to serve woff2 rather than ttf.
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/**
 * Google splits each family across subsets; ship only the three the menu needs.
 * Cyrillic/Greek/symbol subsets would multiply the payload for nothing.
 * latin-ext is not optional: Vietnamese Ỳ/Ỵ/Ỷ (U+1EF2-1EF7) live there, not in
 * the vietnamese subset (which stops at U+1EF9).
 */
function wantedSubset(unicodeRange) {
  const r = unicodeRange || "";
  return (
    r.includes("U+0102-0103") || // vietnamese
    r.includes("U+0100-02BA") || // latin-ext
    r.includes("U+0000-00FF") //   latin
  );
}

function subsetName(unicodeRange) {
  if (unicodeRange.includes("U+0102-0103")) return "vietnamese";
  if (unicodeRange.includes("U+0100-02BA")) return "latin-ext";
  return "latin";
}

const css = await fetch(CSS_URL, { headers: { "User-Agent": UA } }).then((r) => r.text());
const blocks = [...css.matchAll(/@font-face\s*\{([\s\S]*?)\}/g)].map(([, body]) => body);

fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) fs.unlinkSync(path.join(OUT, f));

const manifest = [];
const used = new Map();

for (const body of blocks) {
  const unicodeRange = (body.match(/unicode-range:\s*([^;]+)/) || [])[1]?.trim() || "";
  if (!wantedSubset(unicodeRange)) continue;

  const url = (body.match(/url\((https:\/\/[^)]+\.woff2)\)/) || [])[1];
  if (!url) continue;

  const family = (body.match(/font-family:\s*'([^']+)'/) || [])[1] || "font";
  const style = (body.match(/font-style:\s*([^;]+)/) || [])[1]?.trim() || "normal";
  const weight = (body.match(/font-weight:\s*([^;]+)/) || [])[1]?.trim() || "400";

  const slug = `${family}-${weight}-${style}-${subsetName(unicodeRange)}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  const n = (used.get(slug) ?? 0) + 1;
  used.set(slug, n);
  const file = (n === 1 ? slug : `${slug}-${n}`) + ".woff2";

  const buf = Buffer.from(
    await fetch(url, { headers: { "User-Agent": UA } }).then((r) => r.arrayBuffer()),
  );
  fs.writeFileSync(path.join(OUT, file), buf);

  // Keep the descriptor block exactly as Google wrote it, minus the src line —
  // the renderer re-inserts src as a data: URI.
  const descriptors = body
    .split(";")
    .map((d) => d.trim())
    .filter((d) => d && !d.startsWith("src:"))
    .join(";");

  manifest.push({ file, family, weight, style, descriptors });
  console.log(`${file.padEnd(40)} ${(buf.length / 1024).toFixed(1).padStart(6)} KB`);
}

fs.writeFileSync(path.join(OUT, "faces.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`\nfaces.json — ${manifest.length} faces`);
