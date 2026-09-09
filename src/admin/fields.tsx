import type { Menu } from "../../lib/menuSchema.js";

/* Shared field primitives for the owner admin (German UI, dark theme).
   Used by both the menu tabs and the website-text tabs of AdminEditor. */

export type Localized = { de: string; en: string };
type Dish = Menu["lunch"]["dishes"][number];
type DrinkGroup = Menu["dinner"]["drinks"]["groups"][number];
type DrinkItem = DrinkGroup["items"][number];

export const inputCls =
  "w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-zinc-500";
export const labelCls = "block text-[11px] font-medium uppercase tracking-wide text-zinc-500";
export const btnGhost =
  "rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-500 disabled:opacity-40";

export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

/** German + English pair for one localized string. */
export function LocField({
  label,
  value,
  onChange,
  textarea,
  hint,
}: {
  label: string;
  value: Localized;
  onChange: (v: Localized) => void;
  textarea?: boolean;
  hint?: string;
}) {
  const El = textarea ? "textarea" : "input";
  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className={labelCls}>{label} (Deutsch)</label>
          <El
            className={inputCls + (textarea ? " min-h-16" : "")}
            value={value.de}
            onChange={(e) => onChange({ ...value, de: e.target.value })}
          />
        </div>
        <div>
          <label className={labelCls}>{label} (Englisch)</label>
          <El
            className={inputCls + (textarea ? " min-h-16" : "")}
            value={value.en}
            onChange={(e) => onChange({ ...value, en: e.target.value })}
          />
        </div>
      </div>
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

/** Single plain-text (language-neutral) input, e.g. address fields. */
export function TextField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

export function NameField({
  value,
  onChange,
}: {
  value: string | Localized;
  onChange: (v: string | Localized) => void;
}) {
  if (typeof value === "string") {
    return (
      <div>
        <label className={labelCls}>Name</label>
        <input className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }
  return <LocField label="Name" value={value} onChange={onChange} />;
}

export function PriceField({
  value,
  onChange,
  label = "Preis (€)",
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  label?: string;
}) {
  return (
    <div className="w-28">
      <label className={labelCls}>{label}</label>
      <input
        type="number"
        step="0.1"
        min="0"
        className={inputCls}
        value={value ?? ""}
        placeholder="–"
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      />
    </div>
  );
}

function DishRow({
  dish,
  onChange,
  onRemove,
  onMove,
}: {
  dish: Dish;
  onChange: (d: Dish) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-14">
          <label className={labelCls}>Nr.</label>
          <input
            className={inputCls}
            value={dish.no}
            onChange={(e) => onChange({ ...dish, no: e.target.value })}
          />
        </div>
        <div className="min-w-52 flex-1">
          <NameField value={dish.name} onChange={(name) => onChange({ ...dish, name })} />
        </div>
        <PriceField value={dish.price} onChange={(price) => onChange({ ...dish, price })} />
        <div className="flex gap-1 pb-0.5">
          <button type="button" className={btnGhost} onClick={() => onMove(-1)} title="nach oben">↑</button>
          <button type="button" className={btnGhost} onClick={() => onMove(1)} title="nach unten">↓</button>
          <button type="button" className={btnGhost} onClick={onRemove} title="Gericht löschen">✕</button>
        </div>
      </div>
      {dish.desc && (
        <div className="mt-2">
          <LocField
            label="Beschreibung"
            value={dish.desc}
            onChange={(desc) => onChange({ ...dish, desc })}
          />
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-zinc-300">
        {(["vegan", "vegetarisch"] as const).map((t) => (
          <label key={t} className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={dish.tags.includes(t)}
              onChange={(e) =>
                onChange({
                  ...dish,
                  tags: e.target.checked
                    ? [...dish.tags, t]
                    : dish.tags.filter((x) => x !== t),
                })
              }
            />
            {t}
          </label>
        ))}
        <label className="flex items-center gap-1.5">
          <span className={labelCls + " inline"}>Kennzeichen (z.B. 4, b)</span>
          <input
            className={inputCls + " w-24"}
            value={dish.marks.join(", ")}
            onChange={(e) =>
              onChange({
                ...dish,
                marks: e.target.value
                  .split(",")
                  .map((m) => m.trim())
                  .filter(Boolean),
              })
            }
          />
        </label>
        {!dish.desc && (
          <button
            type="button"
            className={btnGhost}
            onClick={() => onChange({ ...dish, desc: { de: "", en: "" } })}
          >
            + Beschreibung
          </button>
        )}
      </div>
    </div>
  );
}

function newDish(no: string): Dish {
  return { no, name: "", tags: [], marks: [], desc: { de: "", en: "" }, price: null };
}

export function DishList({
  dishes,
  onChange,
}: {
  dishes: Dish[];
  onChange: (d: Dish[]) => void;
}) {
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= dishes.length) return;
    const next = [...dishes];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }
  return (
    <div className="space-y-2">
      {dishes.map((d, i) => (
        <DishRow
          key={i}
          dish={d}
          onChange={(nd) => onChange(dishes.map((x, xi) => (xi === i ? nd : x)))}
          onRemove={() => onChange(dishes.filter((_, xi) => xi !== i))}
          onMove={(dir) => move(i, dir)}
        />
      ))}
      <button
        type="button"
        className={btnGhost}
        onClick={() => onChange([...dishes, newDish(String(dishes.length + 1).padStart(2, "0"))])}
      >
        + Gericht hinzufügen
      </button>
    </div>
  );
}

export function DrinkGroupEditor({
  group,
  onChange,
}: {
  group: DrinkGroup;
  onChange: (g: DrinkGroup) => void;
}) {
  function setItem(i: number, item: DrinkItem) {
    onChange({ ...group, items: group.items.map((x, xi) => (xi === i ? item : x)) });
  }
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <h4 className="mb-2 text-sm font-semibold text-zinc-200">{group.title.de}</h4>
      <div className="space-y-2">
        {group.items.map((it, i) => (
          <div key={i} className="flex flex-wrap items-end gap-3">
            <div className="min-w-52 flex-1">
              <NameField value={it.name} onChange={(name) => setItem(i, { ...it, name })} />
            </div>
            {group.sizes ? (
              group.sizes.map((s, si) => (
                <PriceField
                  key={si}
                  label={s}
                  value={it.prices?.[si] ?? null}
                  onChange={(p) => {
                    const prices = [...(it.prices ?? group.sizes!.map(() => null))];
                    prices[si] = p;
                    setItem(i, { ...it, prices });
                  }}
                />
              ))
            ) : (
              <>
                <div className="w-24">
                  <label className={labelCls}>Größe</label>
                  <input
                    className={inputCls}
                    value={it.size ?? ""}
                    onChange={(e) => setItem(i, { ...it, size: e.target.value || null })}
                  />
                </div>
                <PriceField
                  value={it.price ?? null}
                  onChange={(p) => setItem(i, { ...it, price: p ?? undefined })}
                />
              </>
            )}
            <button
              type="button"
              className={btnGhost}
              onClick={() =>
                onChange({ ...group, items: group.items.filter((_, xi) => xi !== i) })
              }
              title="Getränk löschen"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          className={btnGhost}
          onClick={() =>
            onChange({
              ...group,
              items: [
                ...group.items,
                group.sizes
                  ? { name: { de: "", en: "" }, marks: [], prices: group.sizes.map(() => null) }
                  : { name: { de: "", en: "" }, marks: [], size: null, price: 0 },
              ],
            })
          }
        >
          + Getränk hinzufügen
        </button>
      </div>
    </div>
  );
}
