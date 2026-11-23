"use client";
import { useState } from "react";
import { Plus, Pencil, Trash2, Check, X, Package } from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { productsRepo } from "@/lib/nutrition/storage";
import { CATEGORY_LABEL, CATEGORY_SHORT, validateProduct } from "@/lib/nutrition/products";
import { drinkConcentrationMgL } from "@/lib/nutrition/sodium";
import type { Product, ProductCategory } from "@/lib/nutrition/types";
import { uid } from "@/lib/types";

const inp = "h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm";
type Draft = { name: string; brand: string; category: ProductCategory; carbsG: string; sodiumMg: string; volumeMl: string; caffeineMg: string; stock: string };
const blank: Draft = { name: "", brand: "", category: "gel", carbsG: "", sodiumMg: "", volumeMl: "", caffeineMg: "", stock: "" };
const num = (s: string) => (s.trim() === "" ? 0 : Number(s.replace(",", ".")));
const toDraft = (p: Product): Draft => ({ name: p.name, brand: p.brand, category: p.category, carbsG: String(p.carbsG), sodiumMg: String(p.sodiumMg), volumeMl: String(p.volumeMl), caffeineMg: String(p.caffeineMg), stock: p.stock == null ? "" : String(p.stock) });

/** Catalogue personnel : chaque valeur est saisie par l'utilisateur à partir de l'emballage (rien n'est pré-rempli). */
export function Catalog({ selected, onToggle, drinkId, onDrink }: { selected?: string[]; onToggle?: (id: string) => void; drinkId?: string | null; onDrink?: (id: string | null) => void }) {
  const products = productsRepo.useAll();
  const [d, setD] = useState<Draft>(blank); const [editing, setEditing] = useState<string | null>(null); const [errs, setErrs] = useState<string[]>([]); const [open, setOpen] = useState(false);
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const p: Product = { id: editing ?? uid(), name: d.name.trim(), brand: d.brand.trim(), category: d.category, carbsG: num(d.carbsG), sodiumMg: num(d.sodiumMg), volumeMl: num(d.volumeMl), caffeineMg: num(d.caffeineMg), stock: d.stock.trim() === "" ? null : num(d.stock) };
    const v = validateProduct(p); setErrs(v); if (v.length) return;
    productsRepo.upsert(p); setD(blank); setEditing(null); setOpen(false);
    if (onToggle && !editing && !(selected ?? []).includes(p.id)) onToggle(p.id);
  };
  const f = (k: keyof Draft, l: string, unit?: string, ph?: string) => <label className="grid gap-1 text-sm font-medium">{l}<span className="relative"><input inputMode="decimal" className={clsx(inp, unit && "pr-12")} value={d[k]} placeholder={ph} onChange={(e) => setD({ ...d, [k]: e.target.value })} />{unit && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-500">{unit}</span>}</span></label>;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-600">Vos produits, avec les valeurs <b>par portion</b> lues sur l&apos;emballage. Aucune valeur n&apos;est inventée ou pré-remplie.</p>
        {!open && <Button size="sm" onClick={() => { setOpen(true); setEditing(null); setD(blank); setErrs([]); }}><Plus className="size-4" />Ajouter un produit</Button>}
      </div>
      {open && (
        <form onSubmit={save} noValidate className="frost-panel grid gap-3 p-4" aria-label={editing ? "Modifier le produit" : "Nouveau produit"}>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-sm font-medium sm:col-span-1">Nom<input className={inp} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} maxLength={60} required /></label>
            <label className="grid gap-1 text-sm font-medium">Marque (facultatif)<input className={inp} value={d.brand} onChange={(e) => setD({ ...d, brand: e.target.value })} maxLength={40} /></label>
            <label className="grid gap-1 text-sm font-medium">Catégorie<select className={inp} value={d.category} onChange={(e) => setD({ ...d, category: e.target.value as ProductCategory })}>{(Object.keys(CATEGORY_LABEL) as ProductCategory[]).map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</select></label>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{f("carbsG", "Glucides", "g")}{f("sodiumMg", "Sodium", "mg")}{f("volumeMl", d.category === "boisson" ? "Volume préparé" : "Volume", "ml")}{f("caffeineMg", "Caféine", "mg")}{f("stock", "Quantité disponible", undefined, "facultatif")}</div>
          {d.category === "boisson" && <p className="text-xs text-ink-500">Boisson : valeurs pour une portion préparée (par exemple une flasque de 500 ml). Concentration en sodium : {drinkConcentrationMgL(num(d.sodiumMg), num(d.volumeMl))} mg/L.</p>}
          {d.category === "sel" && <p className="text-xs text-ink-500">Attention : saisissez le <b>sodium</b>, pas le sel (1 g de sel ≈ 390 mg de sodium).</p>}
          {errs.length > 0 && <ul role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{errs.map((x) => <li key={x}>{x}</li>)}</ul>}
          <div className="flex gap-2"><Button type="submit" size="sm"><Check className="size-4" />{editing ? "Enregistrer" : "Ajouter"}</Button><Button type="button" size="sm" variant="ghost" onClick={() => { setOpen(false); setEditing(null); setErrs([]); }}><X className="size-4" />Annuler</Button></div>
        </form>)}
      {!products.length ? <div className="rounded-2xl border border-dashed border-ink-300 bg-white/50 p-6 text-center text-sm text-ink-600"><Package className="mx-auto size-8 text-ink-400" /><p className="mt-2 font-semibold text-ink-800">Catalogue vide</p><p>Ajoutez vos gels, boissons, barres ou capsules : le plan indiquera combien en emporter.</p></div> : (
        <ul className="grid gap-2 md:grid-cols-2">{products.map((p) => { const on = (selected ?? []).includes(p.id); return (
          <li key={p.id} className={clsx("rounded-2xl border bg-white/70 p-3", on ? "border-pine-500 ring-1 ring-pine-500/40" : "border-ink-100")}>
            <div className="flex items-start gap-3">
              {onToggle && <input type="checkbox" className="mt-1 size-4 accent-[var(--color-pine-600)]" checked={on} onChange={() => onToggle(p.id)} aria-label={`Utiliser « ${p.name} » pendant la course`} />}
              <div className="min-w-0 flex-1"><p className="font-semibold">{p.name}{p.brand && <span className="font-normal text-ink-500"> · {p.brand}</span>}</p>
                <p className="text-xs text-ink-600"><span className="mr-1.5 rounded-full bg-ink-100 px-2 py-0.5 font-semibold">{CATEGORY_SHORT[p.category]}</span>{p.carbsG} g glucides · {p.sodiumMg} mg sodium{p.volumeMl ? ` · ${p.volumeMl} ml` : ""}{p.caffeineMg ? ` · ${p.caffeineMg} mg caféine` : ""}{p.stock != null ? ` · stock ${p.stock}` : ""}</p>
                {onDrink && p.category === "boisson" && on && <label className="mt-1.5 flex items-center gap-2 text-xs font-medium"><input type="radio" name="drink" checked={drinkId === p.id} onChange={() => onDrink(p.id)} className="accent-[var(--color-pine-600)]" />Boisson principale (remplace l&apos;eau plate)</label>}
              </div>
              <button type="button" aria-label={`Modifier « ${p.name} »`} className="grid size-8 place-items-center rounded-lg hover:bg-ink-100" onClick={() => { setEditing(p.id); setD(toDraft(p)); setOpen(true); setErrs([]); }}><Pencil className="size-4" /></button>
              <button type="button" aria-label={`Supprimer « ${p.name} »`} className="grid size-8 place-items-center rounded-lg hover:bg-danger/10 hover:text-danger" onClick={() => { if (confirm(`Supprimer « ${p.name} » du catalogue ?`)) { productsRepo.remove(p.id); if (on && onToggle) onToggle(p.id); if (drinkId === p.id && onDrink) onDrink(null); } }}><Trash2 className="size-4" /></button>
            </div>
          </li>); })}</ul>)}
      {onDrink && drinkId && <button type="button" className="w-fit text-xs font-semibold text-pine-700 underline" onClick={() => onDrink(null)}>Boire de l&apos;eau plate (aucune boisson principale)</button>}
    </div>
  );
}
