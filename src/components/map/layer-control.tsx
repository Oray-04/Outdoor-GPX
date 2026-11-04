"use client";
import { useEffect, useRef, useState } from "react";
import type { Map as MLMap } from "maplibre-gl";
import { Layers, Lock, X } from "lucide-react";
import clsx from "clsx";
import { BASEMAPS, GROUP_LABEL, OVERLAYS, applyLayers, dropKeyedLayers, type BasemapGroup } from "@/lib/basemaps";
import { setBasemapPref, setOverlayPref, setThunderforestKey, thunderforestFromEnv, useBasemapPref, useOverlayPref, useThunderforestKey } from "@/lib/map-prefs";

/**
 * Sélecteur de fonds de carte et de surcouches : un seul bouton compact qui ouvre une petite fenêtre.
 * Le choix est mémorisé et partagé par toutes les cartes du site.
 */
export function LayerControl({ map, ready, className }: { map: { current: MLMap | null }; ready: boolean; className?: string }) {
  const base = useBasemapPref();
  const overlays = useOverlayPref();
  const tfKey = useThunderforestKey();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const lastKey = useRef(tfKey);

  useEffect(() => {
    const m = map.current; if (!m || !ready) return;
    if (lastKey.current !== tfKey) { dropKeyedLayers(m); lastKey.current = tfKey; }
    applyLayers(m, base, overlays, { thunderforest: tfKey });
  }, [map, ready, base, overlays, tfKey]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const groups = (["ign", "world", "outdoor"] as BasemapGroup[]).map((g) => ({ g, items: BASEMAPS.filter((b) => b.group === g) }));
  const needsKey = !tfKey;

  return (
    <div ref={box} className={clsx("absolute right-2.5 top-[5rem] z-10", className)}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="Fonds de carte et surcouches" title="Fonds de carte"
        className="grid size-[29px] place-items-center rounded bg-white text-ink-800 shadow ring-1 ring-black/10 hover:bg-ink-50"><Layers className="size-[17px]" /></button>
      {open && (
        <div role="dialog" aria-label="Fonds de carte" className="absolute right-0 top-9 max-h-[min(26rem,calc(100dvh-14rem))] w-[min(17rem,calc(100vw-1.5rem))] overflow-y-auto rounded-xl bg-white p-2 text-sm shadow-lift ring-1 ring-black/10">
          <div className="flex items-center justify-between px-1.5 pb-1"><p className="text-xs font-bold uppercase tracking-wider text-ink-400">Fond de carte</p><button type="button" aria-label="Fermer" onClick={() => setOpen(false)} className="grid size-6 place-items-center rounded hover:bg-ink-100"><X className="size-4" /></button></div>
          {groups.map(({ g, items }) => (
            <div key={g} className="mb-1">
              <p className="px-1.5 pt-1 text-[11px] font-semibold text-ink-500">{GROUP_LABEL[g]}</p>
              {items.map((b) => {
                const locked = !!b.keyed && needsKey;
                return (
                  <label key={b.id} title={b.note} className={clsx("flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1.5 hover:bg-ink-50", base === b.id && !locked && "bg-pine-50 font-semibold", locked && "text-ink-400")}>
                    <input type="radio" name="basemap" className="accent-[var(--color-pine-600)]" checked={base === b.id} onChange={() => { setBasemapPref(b.id); if (!locked) setOpen(false); }} />
                    <span className="flex-1">{b.label}</span>{locked && <Lock className="size-3.5" aria-label="Clé requise" />}
                  </label>
                );
              })}
              {g === "outdoor" && needsKey && (
                <form className="mx-1.5 mb-1 mt-0.5 grid gap-1.5 rounded-lg bg-ink-50 p-2 text-xs" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { setThunderforestKey(draft); setDraft(""); } }}>
                  <p>Ces fonds demandent une <b>clé gratuite</b> <a className="font-semibold text-pine-700 underline" href="https://www.thunderforest.com/pricing/" target="_blank" rel="noopener noreferrer">(à créer sur thunderforest.com)</a>. Elle reste dans votre navigateur.</p>
                  <div className="flex gap-1.5"><input aria-label="Clé Thunderforest" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Votre clé" className="h-8 min-w-0 flex-1 rounded border border-ink-200 px-2" /><button className="h-8 rounded bg-pine-600 px-2.5 font-semibold text-white">OK</button></div>
                </form>
              )}
              {g === "outdoor" && !needsKey && !thunderforestFromEnv && <button type="button" className="px-1.5 text-[11px] text-ink-500 underline" onClick={() => setThunderforestKey("")}>Retirer ma clé</button>}
            </div>
          ))}
          <div className="mt-1 border-t border-ink-100 pt-1">
            <p className="px-1.5 pt-1 text-xs font-bold uppercase tracking-wider text-ink-400">Surcouches</p>
            {OVERLAYS.map((o) => (
              <label key={o.id} title={o.note} className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1.5 hover:bg-ink-50">
                <input type="checkbox" className="accent-[var(--color-pine-600)]" checked={overlays.includes(o.id)} onChange={(e) => setOverlayPref(e.target.checked ? [...overlays, o.id] : overlays.filter((x) => x !== o.id))} /><span>{o.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
