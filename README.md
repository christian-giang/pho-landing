# Phở Restaurant Konstanz — website

The website of Phở Restaurant Konstanz (Hindenburgstraße 15, 78467 Konstanz),
exported from the Mano redesign builder for hosting on Vercel.

Three things live here:

| | |
|---|---|
| **The site** | Hand-written HTML/CSS/JS in `public/`. No framework, no build step. |
| **Reservations** | `POST /api/reserve` sends two emails through Resend. |
| **Owner admin** | `/admin` — the restaurant edits its own texts, menu and opening hours. Saving regenerates the two Abendkarte PDFs. |

---

## Layout

```
public/            the website, served as-is
  index.html         one page: hero, Mittagsmenü, Abendkarte, Kontakt, Impressum
  menu.js            renders the evening menu from /menu.json
  content.js         overlays the editable website text from /content.json
  i18n.js            DE/EN switch over [data-i18n] markup
  reserve.js         the reservation modal
  admin/             admin SPA shell (admin.js/admin.css are built)
  assets/print/      photos used by the PDF renderer
seed/              menu.json, content.json and the two PDFs as first exported
fonts/             woff2 files embedded into the generated PDFs
src/admin/         React sources for the owner admin
api/               Vercel functions
lib/               shared code (schemas, mail, PDF renderer, auth, storage)
```

### Where the data lives

`menu.json`, `content.json` and the two `abendkarte*.pdf` files are the only
things the owner can change, so they cannot be static files: Vercel's filesystem
is read-only. They live in **Vercel Blob**, and `seed/` holds the versions as
exported from the builder.

Reads go through `api/data.ts`, which serves the Blob copy and falls back to
`seed/` when the store is empty. So a fresh deployment already shows the right
menu, and the first owner save switches it over — there is nothing to seed by
hand. The `X-Data-Source` response header says which one you got.

`vercel.json` rewrites the paths the site already asks for onto that function:

```
/menu.json                -> /api/data?file=menu.json
/content.json             -> /api/data?file=content.json
/assets/abendkarte.pdf    -> /api/data?file=abendkarte.pdf
/assets/abendkarte-en.pdf -> /api/data?file=abendkarte-en.pdf
```

**Those four files must never exist under `public/`.** Vercel resolves the
filesystem before rewrites, so a static file of the same name would shadow the
function and the site would be stuck on the seed forever.

---

## Deploying

1. **Create the project** on Vercel and point it at this repo. Framework preset
   "Other"; `vercel.json` sets the rest.
2. **Connect a Blob store** (Storage → Blob → Connect). This sets
   `BLOB_READ_WRITE_TOKEN` automatically. Without it the site still works, but
   the owner admin cannot save.
3. **Set the environment variables** from `.env.example`:

   ```
   RESEND_API_KEY        from resend.com/api-keys
   MAIL_FROM             a sender verified in Resend
   RESERVATION_TO        the restaurant's inbox
   RESERVATION_TO_NAME   display name on the emails
   OWNER_PASSWORD_HASH   npm run hash-password -- "the password"
   COOKIE_SECRET         openssl rand -base64 32
   ```

   The reservation values are the same four that were in the builder's
   `projects/F1yVzx9j-a/reservation.env`. `OWNER_PASSWORD_HASH` uses the same
   scrypt `salt:hash` format the builder stored, so the existing owner password
   can be carried over by copying the old hash instead of choosing a new one.

4. **Deploy.** The build runs `node build.mjs`, which bundles the admin SPA;
   `public/` is published as-is.

### Function settings

`api/menu.ts` starts a Chromium to render the PDFs. `vercel.json` gives it
`maxDuration: 60`. Memory is left at the project default deliberately — pinning
a value that the plan does not allow fails the deploy. If a save ever reports
that the PDFs could not be regenerated, raise the function memory in the project
settings (1 GB is the practical floor for `@sparticuz/chromium`).

---

## The owner admin

`/admin`, password-gated, German UI. Two groups of tabs: the website texts
(`content.json`) and the menu (`menu.json`). One **Speichern** saves whichever
changed.

A menu save also re-renders `abendkarte.pdf` and `abendkarte-en.pdf` from the
same data, so the downloadable cards can never drift from the website. The menu
is stored first and the PDFs after: if rendering fails the edit is still saved
and the response says the cards are stale, rather than losing the owner's work.

Edits appear on the site within a minute (`s-maxage=60` on the data endpoint).

---

## The PDF renderer

`lib/menuPdf.ts` is the builder's renderer with the markup and CSS untouched.
Two things had to change to fit a serverless function, and both were verified by
comparing output against the PDFs in `seed/`:

1. **Browser.** Playwright cannot run on Vercel, so it is now puppeteer-core
   driving `@sparticuz/chromium`.

   That package launches with `--font-render-hinting=none`, which switches Blink
   to sub-pixel glyph advances. The builder rendered through Playwright's
   `chrome-headless-shell`, which rounds advances to whole pixels — a ~0.5%
   difference in text width, enough to move where several paragraphs wrap.
   `launchArgs()` forces `--font-render-hinting=full` to restore the original
   line breaking. Do not drop that.

2. **Fonts.** The original fetched Lora and Nunito Sans from Google Fonts
   mid-render. A serverless Chromium has no system fonts at all, so a failed
   font request would have produced a PDF of tofu boxes. `fonts/` holds those
   exact files (`scripts/fetch-fonts.mjs` pulls them from the same CSS2 URL the
   original used and keeps Google's `@font-face` descriptors verbatim), and they
   are inlined as data URIs. Rendering is now offline and deterministic.

Current output vs. the builder's: same 11 pages, identical extracted text,
identical text bounding boxes, and pages 3–11 pixel-identical at 100 dpi. The
cover differs by 0.14% of pixels — the blur of the drop shadow behind the white
cover type — which is not visible. Files are ~1.2 MB rather than ~500 KB,
because this Chromium build rasterises the shadow and gradient layers full-page;
that is inherent to the binary and does not affect what you see.

### Checking a PDF change

```bash
npm run render-pdf                # renders seed/menu.json into tmp-pdf/
diff <(pdftotext seed/abendkarte.pdf -) <(pdftotext tmp-pdf/abendkarte.pdf -)
```

With no `CHROME_PATH` this uses the same `@sparticuz/chromium` production runs
on, which is what you want. If you do set `CHROME_PATH`, point it at a
`chrome-headless-shell` binary — full Chrome ignores `--font-render-hinting` in
its new headless mode and will wrap a few lines differently.

---

## Development

```bash
npm install
npm run build       # bundles the admin SPA into public/admin/
npm run typecheck
npm run dev         # vercel dev — needs the Vercel CLI and the env vars
```

The site itself is plain static files: opening `public/index.html` through any
HTTP server shows everything except the menu, which needs `/menu.json` (serve
`seed/menu.json` there, as `vercel.json` does in production).

### Rate limiting

`lib/ratelimit.ts` is in-process, so on serverless each warm instance keeps its
own counter and the effective limit is (instances × max). That is deliberate: it
is a brake on a single abusive client, not a security boundary. The real
defences are the honeypot field on the reservation form and the scrypt password
on the admin. Swap in Vercel KV / Upstash there if traffic ever warrants it.

---

## Relationship to the builder

Exported from `manoit-v1-builder`, project `F1yVzx9j-a`, version `wip`. The
files in `public/` are that version verbatim, with three deliberate differences:

- `reserve.js` posts to `/api/reserve` instead of the builder's
  `/c/<id>/reserve`.
- `favicon.svg` was added (the brand roundel already inline in `index.html`) and
  linked from both pages — the builder-hosted preview had no favicon and a live
  site 404ing on `/favicon.ico` is untidy.
- `assets/gen-01.jpg`, `gen-02.jpg` and `img-01.jpg` were dropped; nothing
  references them.

This repo is now the source of truth. Edits made here do not flow back to the
builder, and re-exporting from the builder would overwrite them.
