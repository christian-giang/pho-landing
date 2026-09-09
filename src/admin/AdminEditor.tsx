import { useState } from "react";
import type { Menu } from "../../lib/menuSchema.js";
import type { Content } from "../../lib/contentSchema.js";
import {
  clone,
  LocField,
  TextField,
  DishList,
  DrinkGroupEditor,
  btnGhost,
} from "./fields.js";

/* Owner-facing website editor (German UI, dark theme). One tabbed interface
   over two data files: content.json (static website text) and menu.json
   (menus + hours). One Save persists whichever changed; only a menu change
   regenerates the PDF cards.

   Ported unchanged from the builder apart from the project-scoped URLs, which
   are now plain /api/* routes. */

type TabKey =
  | "start"
  | "about"
  | "evening"
  | "contact"
  | "imprint"
  | "lunch"
  | "dinner"
  | "drinks"
  | "hours";

const TEXT_TABS: { key: TabKey; label: string }[] = [
  { key: "start", label: "Start" },
  { key: "about", label: "Über uns" },
  { key: "evening", label: "Abendkarte-Text" },
  { key: "contact", label: "Kontakt & Adresse" },
  { key: "imprint", label: "Impressum" },
];
const MENU_TABS: { key: TabKey; label: string }[] = [
  { key: "lunch", label: "Mittagsmenü" },
  { key: "dinner", label: "Abendkarte" },
  { key: "drinks", label: "Getränke" },
  { key: "hours", label: "Öffnungszeiten" },
];

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "shrink-0 rounded-md px-3 py-1.5 text-sm " +
        (active ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200")
      }
    >
      {children}
    </button>
  );
}

function TabIntro({ children }: { children: React.ReactNode }) {
  return <p className="mb-4 text-sm text-zinc-400">{children}</p>;
}

export default function AdminEditor({
  initialMenu,
  initialContent,
}: {
  initialMenu: Menu;
  initialContent: Content | null;
}) {
  const [menu, setMenu] = useState<Menu>(() => clone(initialMenu));
  const [content, setContent] = useState<Content | null>(() =>
    initialContent ? clone(initialContent) : null,
  );
  const [menuDirty, setMenuDirty] = useState(false);
  const [contentDirty, setContentDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [tab, setTab] = useState<TabKey>(initialContent ? "start" : "lunch");

  function updateMenu(fn: (m: Menu) => void) {
    setMenu((cur) => {
      const next = clone(cur);
      fn(next);
      return next;
    });
    setMenuDirty(true);
    setStatus(null);
  }
  function updateContent(fn: (c: Content) => void) {
    setContent((cur) => {
      if (!cur) return cur;
      const next = clone(cur);
      fn(next);
      return next;
    });
    setContentDirty(true);
    setStatus(null);
  }

  async function post(url: string, body: unknown) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok && data?.ok, data };
  }

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      let savedContent = false;
      let savedMenu = false;
      let pdfOk = true;
      let firstError: string | null = null;

      if (contentDirty && content) {
        const r = await post("/api/content", content);
        if (r.ok) savedContent = true;
        else firstError = firstError || r.data?.error || "Texte konnten nicht gespeichert werden.";
      }
      if (menuDirty) {
        const r = await post("/api/menu", menu);
        if (r.ok) {
          savedMenu = true;
          pdfOk = r.data?.pdf?.ok !== false;
        } else {
          firstError = firstError || r.data?.error || "Speisekarte konnte nicht gespeichert werden.";
        }
      }

      if (savedContent) setContentDirty(false);
      if (savedMenu) setMenuDirty(false);

      if (firstError) {
        setStatus({ kind: "error", text: firstError });
      } else if (savedContent || savedMenu) {
        const text =
          savedMenu && !pdfOk
            ? "Gespeichert. Website aktualisiert – die PDF-Karten konnten nicht neu erzeugt werden, bitte melden."
            : savedMenu
              ? "Gespeichert. Website und PDF-Karten sind aktualisiert."
              : "Gespeichert. Die Website ist aktualisiert.";
        setStatus({ kind: "ok", text });
      }
    } catch {
      setStatus({ kind: "error", text: "Netzwerkfehler. Bitte erneut versuchen." });
    }
    setSaving(false);
  }

  const dirty = menuDirty || contentDirty;
  const c = content;

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-8">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Website-Verwaltung</h1>
          <p className="text-sm text-zinc-400">
            Wählen Sie oben einen Bereich, ändern Sie den Text und klicken Sie auf „Speichern“.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/" target="_blank" rel="noreferrer" className={btnGhost + " px-3 py-2"}>
            Website ansehen ↗
          </a>
          <button
            type="button"
            className={btnGhost + " px-3 py-2"}
            onClick={async () => {
              await fetch("/api/login", { method: "DELETE" });
              window.location.reload();
            }}
          >
            Abmelden
          </button>
        </div>
      </header>

      {/* Tab bar — two labeled groups */}
      <div className="mb-6 space-y-3">
        {c && (
          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              Website-Texte
            </p>
            <div className="flex flex-wrap gap-1 rounded-lg border border-zinc-800 p-1">
              {TEXT_TABS.map((t) => (
                <TabButton key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>
                  {t.label}
                </TabButton>
              ))}
            </div>
          </div>
        )}
        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Speisekarte
          </p>
          <div className="flex flex-wrap gap-1 rounded-lg border border-zinc-800 p-1">
            {MENU_TABS.map((t) => (
              <TabButton key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>
                {t.label}
              </TabButton>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {/* ---------- Website text tabs ---------- */}
        {c && tab === "start" && (
          <>
            <TabIntro>Der Begrüßungsbereich ganz oben auf der Website.</TabIntro>
            <LocField
              label="Slogan (Kopf- & Fußzeile)"
              value={c.brand.tagline}
              onChange={(v) => updateContent((x) => (x.brand.tagline = v))}
            />
            <LocField
              label="Kleiner Text über der Überschrift"
              value={c.hero.eyebrow}
              onChange={(v) => updateContent((x) => (x.hero.eyebrow = v))}
            />
            <LocField
              label="Überschrift"
              value={c.hero.title}
              onChange={(v) => updateContent((x) => (x.hero.title = v))}
            />
            <LocField
              label="Einleitungssatz"
              value={c.hero.lead}
              onChange={(v) => updateContent((x) => (x.hero.lead = v))}
              textarea
            />
            <LocField
              label="Button: Reservieren"
              value={c.hero.ctaReserve}
              onChange={(v) => updateContent((x) => (x.hero.ctaReserve = v))}
            />
            <LocField
              label="Button: Öffnungszeiten"
              value={c.hero.ctaHours}
              onChange={(v) => updateContent((x) => (x.hero.ctaHours = v))}
            />
          </>
        )}

        {c && tab === "about" && (
          <>
            <TabIntro>Der „Über uns“-Abschnitt mit dem Zitat und der phở-Erklärung.</TabIntro>
            <LocField
              label="Zitat"
              value={c.philosophy.quote}
              onChange={(v) => updateContent((x) => (x.philosophy.quote = v))}
              textarea
            />
            <LocField
              label="Absatz 1"
              value={c.philosophy.copy1}
              onChange={(v) => updateContent((x) => (x.philosophy.copy1 = v))}
              textarea
            />
            <LocField
              label="Absatz 2"
              value={c.philosophy.copy2}
              onChange={(v) => updateContent((x) => (x.philosophy.copy2 = v))}
              textarea
            />
            <LocField
              label="Aussprache-Hinweis (neben „phở“)"
              value={c.philosophy.pron}
              onChange={(v) => updateContent((x) => (x.philosophy.pron = v))}
            />
            <LocField
              label="Was ist phở?"
              value={c.philosophy.explainerBody}
              onChange={(v) => updateContent((x) => (x.philosophy.explainerBody = v))}
              textarea
            />
          </>
        )}

        {c && tab === "evening" && (
          <>
            <TabIntro>Der Einladungstext im Abendkarten-Abschnitt (nicht die Gerichte).</TabIntro>
            <LocField
              label="Überschrift"
              value={c.evening.title}
              onChange={(v) => updateContent((x) => (x.evening.title = v))}
            />
            <LocField
              label="Einleitung"
              value={c.evening.lead}
              onChange={(v) => updateContent((x) => (x.evening.lead = v))}
              textarea
            />
            <LocField
              label="Zusatztext"
              value={c.evening.copy}
              onChange={(v) => updateContent((x) => (x.evening.copy = v))}
              textarea
            />
            <LocField
              label="Öffnungszeiten-Zeile"
              value={c.evening.hoursLine}
              onChange={(v) => updateContent((x) => (x.evening.hoursLine = v))}
            />
          </>
        )}

        {c && tab === "contact" && (
          <>
            <TabIntro>
              Adresse und Telefon. Diese Angaben erscheinen an mehreren Stellen der Website
              (Kopf, Fußzeile, Kontakt, Impressum) und werden überall zugleich aktualisiert.
            </TabIntro>
            <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
              <TextField
                label="Name des Restaurants"
                value={c.contact.name}
                onChange={(v) => updateContent((x) => (x.contact.name = v))}
              />
              <TextField
                label="Straße & Hausnummer"
                value={c.contact.street}
                onChange={(v) => updateContent((x) => (x.contact.street = v))}
              />
              <TextField
                label="PLZ & Ort"
                value={c.contact.city}
                onChange={(v) => updateContent((x) => (x.contact.city = v))}
              />
              <TextField
                label="Telefon (Anzeige, lang)"
                value={c.contact.phoneDisplay}
                onChange={(v) => updateContent((x) => (x.contact.phoneDisplay = v))}
                hint="So steht die Nummer auf der Kontaktseite und im Impressum."
              />
              <TextField
                label="Telefon (Anzeige, kurz)"
                value={c.contact.phoneShort}
                onChange={(v) => updateContent((x) => (x.contact.phoneShort = v))}
                hint="Kurzform im Kopf- und Fußbereich, z. B. 07531 / 697 05 55."
              />
              <TextField
                label="Telefon (Wählnummer)"
                value={c.contact.phoneHref}
                onChange={(v) => updateContent((x) => (x.contact.phoneHref = v))}
                hint="Für den Anruf-Link, ohne Leerzeichen, z. B. +4975316970555."
              />
            </div>
            <LocField
              label="Überschrift"
              value={c.contactSection.title}
              onChange={(v) => updateContent((x) => (x.contactSection.title = v))}
            />
            <LocField
              label="Unterzeile"
              value={c.contactSection.sub}
              onChange={(v) => updateContent((x) => (x.contactSection.sub = v))}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <LocField
                label="Beschriftung „Adresse“"
                value={c.contactSection.addressLabel}
                onChange={(v) => updateContent((x) => (x.contactSection.addressLabel = v))}
              />
              <LocField
                label="Beschriftung „Telefon“"
                value={c.contactSection.phoneLabel}
                onChange={(v) => updateContent((x) => (x.contactSection.phoneLabel = v))}
              />
            </div>
            <LocField
              label="Hinweistext"
              value={c.contactSection.hint}
              onChange={(v) => updateContent((x) => (x.contactSection.hint = v))}
              textarea
            />
            <LocField
              label="Beschriftung „Öffnungszeiten“"
              value={c.contactSection.hoursLabel}
              onChange={(v) => updateContent((x) => (x.contactSection.hoursLabel = v))}
            />
          </>
        )}

        {c && tab === "imprint" && (
          <>
            <TabIntro>Das Impressum. Name und Adresse kommen aus dem Bereich „Kontakt & Adresse“.</TabIntro>
            <LocField
              label="Überschrift"
              value={c.impressum.title}
              onChange={(v) => updateContent((x) => (x.impressum.title = v))}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="Inhaber"
                value={c.impressum.owner}
                onChange={(v) => updateContent((x) => (x.impressum.owner = v))}
              />
              <TextField
                label="USt-IdNr."
                value={c.impressum.vatId}
                onChange={(v) => updateContent((x) => (x.impressum.vatId = v))}
              />
            </div>
            {c.impressum.legal.map((item, i) => (
              <div key={i} className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                <LocField
                  label={`Absatz ${i + 1} – Überschrift`}
                  value={item.heading}
                  onChange={(v) => updateContent((x) => (x.impressum.legal[i].heading = v))}
                />
                <LocField
                  label={`Absatz ${i + 1} – Text`}
                  value={item.text}
                  onChange={(v) => updateContent((x) => (x.impressum.legal[i].text = v))}
                  textarea
                />
              </div>
            ))}
          </>
        )}

        {/* ---------- Menu tabs ---------- */}
        {tab === "lunch" && (
          <>
            <TabIntro>Das Mittagsmenü mit Vorspeise und Tagesgerichten.</TabIntro>
            <LocField
              label="Untertitel"
              value={menu.lunch.subtitle}
              onChange={(v) => updateMenu((m) => (m.lunch.subtitle = v))}
            />
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="mb-2">
                <LocField
                  label="Vorspeise – Titel"
                  value={menu.lunch.starter.title}
                  onChange={(v) => updateMenu((m) => (m.lunch.starter.title = v))}
                />
              </div>
              <LocField
                label="Vorspeise – Beschreibung"
                value={menu.lunch.starter.desc}
                onChange={(v) => updateMenu((m) => (m.lunch.starter.desc = v))}
                textarea
              />
            </div>
            <DishList
              dishes={menu.lunch.dishes}
              onChange={(d) => updateMenu((m) => (m.lunch.dishes = d))}
            />
            <LocField
              label="Hinweis (Mitnehmen)"
              value={menu.lunch.note}
              onChange={(v) => updateMenu((m) => (m.lunch.note = v))}
              textarea
            />
          </>
        )}

        {tab === "dinner" && (
          <>
            <TabIntro>Die Abendkarte, nach Kategorien geordnet.</TabIntro>
            {menu.dinner.categories.map((cat, ci) => (
              <div key={cat.id} className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3">
                <h3 className="mb-3 text-sm font-semibold text-zinc-100">{cat.title.de}</h3>
                {cat.subcategories.map((sub, si) => (
                  <div key={sub.id} className="mb-3 space-y-3">
                    {sub.title && (
                      <LocField
                        label="Zwischentitel"
                        value={sub.title}
                        onChange={(v) =>
                          updateMenu((m) => (m.dinner.categories[ci].subcategories[si].title = v))
                        }
                      />
                    )}
                    {sub.intro && (
                      <LocField
                        label="Einleitung"
                        value={sub.intro}
                        onChange={(v) =>
                          updateMenu((m) => (m.dinner.categories[ci].subcategories[si].intro = v))
                        }
                        textarea
                      />
                    )}
                    <DishList
                      dishes={sub.dishes}
                      onChange={(d) =>
                        updateMenu((m) => (m.dinner.categories[ci].subcategories[si].dishes = d))
                      }
                    />
                  </div>
                ))}
              </div>
            ))}
          </>
        )}

        {tab === "drinks" && (
          <>
            <TabIntro>Die Getränkekarte.</TabIntro>
            {menu.dinner.drinks.groups.map((g, gi) => (
              <DrinkGroupEditor
                key={g.id}
                group={g}
                onChange={(ng) => updateMenu((m) => (m.dinner.drinks.groups[gi] = ng))}
              />
            ))}
          </>
        )}

        {tab === "hours" && (
          <>
            <TabIntro>Die Öffnungszeiten (erscheinen auf der Kontaktseite und in der PDF-Karte).</TabIntro>
            {menu.hours.rows.map((row, ri) => (
              <div key={ri} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                <LocField
                  label="Tage"
                  value={row.days}
                  onChange={(v) => updateMenu((m) => (m.hours.rows[ri].days = v))}
                />
                {row.lines.map((line, li) => (
                  <div key={li} className="mt-2 grid gap-2 sm:grid-cols-2">
                    <LocField
                      label={`Zeit ${li + 1}`}
                      value={line.time}
                      onChange={(v) => updateMenu((m) => (m.hours.rows[ri].lines[li].time = v))}
                    />
                    {line.note && (
                      <LocField
                        label="Zusatz"
                        value={line.note}
                        onChange={(v) => updateMenu((m) => (m.hours.rows[ri].lines[li].note = v))}
                      />
                    )}
                  </div>
                ))}
              </div>
            ))}
            <LocField
              label="Küchen-Hinweis"
              value={menu.hours.kitchenNote}
              onChange={(v) => updateMenu((m) => (m.hours.kitchenNote = v))}
            />
          </>
        )}
      </div>

      <div className="sticky bottom-0 mt-6 flex flex-wrap items-center gap-3 border-t border-zinc-800 bg-zinc-950/95 py-4 backdrop-blur">
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-50"
        >
          {saving ? "Wird gespeichert…" : "Speichern"}
        </button>
        {status && (
          <p className={"text-sm " + (status.kind === "ok" ? "text-emerald-400" : "text-red-400")}>
            {status.text}
          </p>
        )}
        {!status && dirty && <p className="text-sm text-zinc-500">Ungespeicherte Änderungen</p>}
      </div>
    </main>
  );
}
