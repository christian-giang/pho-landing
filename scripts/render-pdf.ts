/* Renders the Abendkarte PDFs locally from seed/menu.json, using the exact code
   path /api/menu runs in production. Point CHROME_PATH at any Chrome/Chromium
   binary; without it this falls back to the serverless @sparticuz build.

   Usage: CHROME_PATH=/path/to/chrome npm run render-pdf [outDir]

   Use it to eyeball the output after touching lib/menuPdf.ts — the PDF is the
   one artefact here that no amount of type-checking can verify. */
import fs from "node:fs";
import path from "node:path";
import { menuSchema } from "../lib/menuSchema.ts";
import { renderMenuPdfs, PDF_FILES } from "../lib/menuPdf.ts";

const outDir = process.argv[2] || "tmp-pdf";
const root = path.join(import.meta.dirname, "..");

const parsed = menuSchema.safeParse(
  JSON.parse(fs.readFileSync(path.join(root, "seed", "menu.json"), "utf8")),
);
if (!parsed.success) {
  console.error("seed/menu.json is invalid:", parsed.error.issues[0]);
  process.exit(1);
}

const result = await renderMenuPdfs(parsed.data);
if (!result.ok) {
  console.error("render failed:", result.error);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
for (const lang of ["de", "en"] as const) {
  const file = path.join(outDir, PDF_FILES[lang]);
  fs.writeFileSync(file, result.pdfs[lang]);
  console.log(`${file}  ${(result.pdfs[lang].length / 1024).toFixed(0)} KB`);
}
