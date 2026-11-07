"use client";
import { useMemo, useState } from "react";
import { List, Map as MapIcon, SlidersHorizontal, X } from "lucide-react";
import clsx from "clsx";
import { RouteCard } from "@/components/ui/route-card";
import { Button } from "@/components/ui/button";
import { RoutesMap } from "./routes-map";
import { useAllRoutes, useVerified } from "@/lib/route-vm";
import { DEFAULT_FILTERS, filterRoutes, type Filters } from "@/lib/route-model";
import { Autocomplete, type Option } from "@/components/ui/autocomplete";
import { communeSuggestions } from "@/lib/communes";
import { SPORTS, DIFFICULTY_LABEL } from "@/lib/sports";
import { DEMO_LAYER, useLayers, useTerrains } from "@/lib/repo";

const SORTS = { recent: "Plus récents", km: "Distance", gain: "Dénivelé +", name: "Nom" } as const;
const toggle = (a: string[], v: string) => (a.includes(v) ? a.filter((x) => x !== v) : [...a, v]);

export function Library({ initialSport }: { initialSport?: string }) {
  const all = useAllRoutes();
  const terrains = useTerrains();
  const allLayers = [...useLayers(), DEMO_LAYER];
  const verified = useVerified();
  const [f, setF] = useState<Filters>({ ...DEFAULT_FILTERS, sports: initialSport && initialSport in SPORTS ? [initialSport] : [] });
  const [view, setView] = useState<"list" | "map">("list");
  const [sort, setSort] = useState<keyof typeof SORTS>("recent");
  const [open, setOpen] = useState(false);

  const countries = useMemo(() => [...new Set(all.map((r) => r.country).filter(Boolean))].sort(), [all]);
  const regions = useMemo(() => [...new Set(all.filter((r) => !f.country || r.country === f.country).map((r) => r.region).filter(Boolean))].sort(), [all, f.country]);
  const list = useMemo(() => {
    const r = filterRoutes(all, f, verified);
    const s = [...r];
    if (sort === "km") s.sort((a, b) => b.stats.distanceM - a.stats.distanceM);
    else if (sort === "gain") s.sort((a, b) => b.stats.gainM - a.stats.gainM);
    else if (sort === "name") s.sort((a, b) => a.name.localeCompare(b.name, "fr"));
    else s.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    return s;
  }, [all, f, verified, sort]);

  const [placeQ, setPlaceQ] = useState("");
  const placeOptions = async (q: string, signal: AbortSignal): Promise<Option<{ label: string; centers: [number, number][] }>[] | null> => {
    const r = await communeSuggestions(q, signal, true); if (!r) return null;
    return r.map((x) => ({ key: x.key, label: x.label, hint: x.hint, value: { label: x.communes.length > 1 ? `Code postal ${q.trim()} (${x.communes.length} communes)` : x.label, centers: x.communes.map((c) => [c.lng, c.lat] as [number, number]) } }));
  };
  const dirty = JSON.stringify(f) !== JSON.stringify(DEFAULT_FILTERS);
  const chip = (on: boolean) => clsx("rounded-full border px-3 py-1.5 text-sm font-medium transition", on ? "border-pine-600 bg-pine-600 text-white" : "border-ink-200 bg-white text-ink-700 hover:border-pine-400");
  const sel = "h-10 w-full rounded-lg border border-ink-200 bg-white px-2 text-sm";

  const panel = (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <Autocomplete label="Commune ou code postal" value={placeQ} onInput={setPlaceQ} fetchOptions={placeOptions} placeholder="04000, Digne, Chamonix…" help="Saisissez 5 chiffres (code postal) ou le début d'un nom de commune."
          onSelect={(o) => { setPlaceQ(o.value.label); setF((x) => ({ ...x, place: { label: o.value.label, centers: o.value.centers, radiusKm: x.place?.radiusKm ?? 20 } })); }} />
        {f.place && <div className="flex flex-wrap items-center gap-2 rounded-lg bg-pine-50 px-3 py-2 text-sm"><span className="font-medium text-pine-700">Zone : {f.place.label}</span>
          <label className="ml-auto flex items-center gap-1.5 text-xs">Rayon<select aria-label="Rayon de la zone" className="h-8 rounded-md border border-ink-200 bg-white px-1.5 text-xs" value={f.place.radiusKm} onChange={(e) => setF((x) => ({ ...x, place: x.place && { ...x.place, radiusKm: +e.target.value } }))}>{[5, 10, 20, 50, 100].map((r) => <option key={r} value={r}>{r} km</option>)}</select></label>
          <button type="button" aria-label="Retirer la zone" className="grid size-7 place-items-center rounded-md hover:bg-white" onClick={() => { setF((x) => ({ ...x, place: null })); setPlaceQ(""); }}><X className="size-4" /></button></div>}
      </div>
      <label className="grid gap-1 text-sm font-medium">Recherche<input className={sel} placeholder="Nom, lieu…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></label>
      <fieldset><legend className="mb-2 text-sm font-medium">Discipline</legend><div className="flex flex-wrap gap-1.5">{Object.entries(SPORTS).map(([k, v]) => <button key={k} aria-pressed={f.sports.includes(k)} className={chip(f.sports.includes(k))} onClick={() => setF({ ...f, sports: toggle(f.sports, k) })}>{v.label}</button>)}</div></fieldset>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-sm font-medium">Pays<select className={sel} value={f.country} onChange={(e) => setF({ ...f, country: e.target.value, region: "" })}><option value="">Tous</option>{countries.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-medium">Région<select className={sel} value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })}><option value="">Toutes</option>{regions.map((c) => <option key={c}>{c}</option>)}</select></label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-sm font-medium">Distance min (km)<input type="number" min={0} className={sel} value={f.minKm} onChange={(e) => setF({ ...f, minKm: Math.max(0, +e.target.value || 0) })} /></label>
        <label className="grid gap-1 text-sm font-medium">Distance max (km)<input type="number" min={0} className={sel} value={f.maxKm} onChange={(e) => setF({ ...f, maxKm: +e.target.value || 0 })} /></label>
      </div>
      <label className="grid gap-1 text-sm font-medium">Dénivelé + max : {f.maxGain} m<input type="range" min={0} max={8000} step={100} value={f.maxGain} onChange={(e) => setF({ ...f, maxGain: +e.target.value })} className="accent-[var(--color-pine-600)]" /></label>
      <label className="grid gap-1 text-sm font-medium">Durée max : {f.maxHours} h<input type="range" min={1} max={24} step={1} value={f.maxHours} onChange={(e) => setF({ ...f, maxHours: +e.target.value })} className="accent-[var(--color-pine-600)]" /></label>
      <fieldset><legend className="mb-2 text-sm font-medium">Difficulté</legend><div className="flex flex-wrap gap-1.5">{Object.entries(DIFFICULTY_LABEL).map(([k, v]) => <button key={k} aria-pressed={f.difficulties.includes(k)} className={chip(f.difficulties.includes(k))} onClick={() => setF({ ...f, difficulties: toggle(f.difficulties, k) })}>{v}</button>)}</div></fieldset>
      <fieldset><legend className="mb-2 text-sm font-medium">Terrain (déclaré par l'auteur)</legend><div className="flex flex-wrap gap-1.5">{terrains.map((t) => <button key={t} aria-pressed={f.terrains.includes(t)} className={chip(f.terrains.includes(t))} onClick={() => setF({ ...f, terrains: toggle(f.terrains, t) })}>{t}</button>)}</div></fieldset>
      <fieldset><legend className="mb-2 text-sm font-medium">Calques</legend><div className="flex flex-wrap gap-1.5">{allLayers.map((l) => <button key={l.id} aria-pressed={f.layers.includes(l.id)} className={chip(f.layers.includes(l.id))} onClick={() => setF({ ...f, layers: toggle(f.layers, l.id) })}><span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: l.color }} />{l.name}</button>)}</div></fieldset>
      <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={f.loopOnly} onChange={(e) => setF({ ...f, loopOnly: e.target.checked })} className="accent-[var(--color-pine-600)]" />Parcours en boucle uniquement</label>
      <label className="grid gap-1 text-sm font-medium">Catalogue<select className={sel} value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value as Filters["scope"] })}><option value="all">Tous</option><option value="public">Mes parcours publics</option><option value="private">Mes parcours privés</option><option value="verified">Officiels vérifiés</option><option value="demo">Démonstration</option></select></label>
      {dirty && <Button variant="secondary" size="sm" onClick={() => { setF(DEFAULT_FILTERS); setPlaceQ(""); }}><X className="size-4" />Réinitialiser</Button>}
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-extrabold sm:text-4xl">Bibliothèque de parcours</h1>
      <p className="mt-2 text-ink-600">Vos parcours et les parcours de démonstration. « Officiels vérifiés » : parcours validés par l'administrateur.</p>
      <div className="mt-6 grid gap-6 lg:grid-cols-[18rem_1fr]">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <button className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-ink-200 bg-white py-2.5 text-sm font-semibold lg:hidden" aria-expanded={open} onClick={() => setOpen(!open)}><SlidersHorizontal className="size-4" />Filtres{dirty && " (actifs)"}</button>
          <div className={clsx("rounded-2xl bg-white p-4 ring-1 ring-ink-100", !open && "hidden lg:block")}>{panel}</div>
        </aside>
        <section aria-live="polite">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-600"><b>{list.length}</b> parcours</p>
            <div className="flex items-center gap-2">
              <label className="text-sm">Tri <select className="ml-1 h-9 rounded-lg border border-ink-200 bg-white px-2 text-sm" value={sort} onChange={(e) => setSort(e.target.value as keyof typeof SORTS)}>{Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <div className="flex rounded-lg bg-ink-100 p-0.5" role="group" aria-label="Affichage">
                <button aria-pressed={view === "list"} onClick={() => setView("list")} className={clsx("flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium", view === "list" && "bg-white shadow")}><List className="size-4" />Liste</button>
                <button aria-pressed={view === "map"} onClick={() => setView("map")} className={clsx("flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium", view === "map" && "bg-white shadow")}><MapIcon className="size-4" />Carte</button>
              </div>
            </div>
          </div>
          {!list.length ? <p className="rounded-xl border border-dashed border-ink-200 p-8 text-center text-ink-500">Aucun parcours ne correspond à ces critères.</p>
            : view === "list" ? <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{list.map((r) => <RouteCard key={r.id} route={r} verified={verified.includes(r.id)} />)}</div>
            : <RoutesMap routes={list} />}
        </section>
      </div>
    </div>
  );
}
