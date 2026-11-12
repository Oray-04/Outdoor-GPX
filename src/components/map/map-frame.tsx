"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import clsx from "clsx";

export interface BannerItem { label: string; value: string }

/** Bandeau sous la carte en plein écran : valeurs clés (distance, dénivelé…). */
export function StatBanner({ title, items }: { title?: string; items: BannerItem[] }) {
  return (
    <div role="status" aria-label="Résumé" className="shrink-0 border-t border-brass-400/30 bg-ink-950 px-4 py-2.5 text-white">
      {title && <p className="mb-1 truncate text-sm font-semibold text-white">{title}</p>}
      <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        {items.map((i) => (
          <div key={i.label} className="flex items-baseline gap-1.5"><dt className="text-[11px] font-medium uppercase tracking-wide text-brass-400">{i.label}</dt><dd className="font-display text-base font-bold text-white">{i.value}</dd></div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Cadre de carte avec bouton plein écran.
 * Utilise l'API plein écran du navigateur quand elle existe ; sinon (iPhone) un plein écran CSS.
 * Le bandeau (`banner`) n'apparaît qu'en plein écran, sous la carte.
 */
export function MapFrame({ className, banner, children }: { className?: string; banner?: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const [ws, setWs] = useState(false); // plein écran d'un espace de travail entier (carte + panneau d'outils)
  const fullRef = useRef(false); fullRef.current = full;
  /** Élément mis en plein écran : l'espace de travail englobant (`data-workspace`) s'il existe — la carte ET ses outils restent utilisables —, sinon la carte seule. */
  const target = () => (ref.current?.closest<HTMLElement>("[data-workspace]") ?? ref.current);

  const exit = useCallback(async () => {
    setFull(false);
    if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch { /* déjà sorti */ } }
  }, []);
  const enter = useCallback(async () => {
    const t = target(); setWs(!!t && t !== ref.current); setFull(true);
    try { await t?.requestFullscreen?.(); } catch { /* repli : plein écran CSS (iPhone) */ }
  }, []);

  useEffect(() => {
    const onChange = () => { if (!document.fullscreenElement && fullRef.current) setFull(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && fullRef.current && !document.fullscreenElement) setFull(false); };
    document.addEventListener("fullscreenchange", onChange);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("fullscreenchange", onChange); window.removeEventListener("keydown", onKey); };
  }, []);

  useEffect(() => {
    const t = target(); const w = t && t !== ref.current ? t : null;
    if (w) { if (full) w.setAttribute("data-fullscreen", "true"); else w.removeAttribute("data-fullscreen"); }
    // la carte change de taille : MapLibre doit se recaler (sinon bandes grises)
    // le navigateur peut faire défiler l'espace de travail en entrant en plein écran : on le remet en haut, puis MapLibre se recale
    const settle = () => { if (w && window.innerWidth >= 1024) w.scrollTop = 0; window.dispatchEvent(new Event("resize")); };
    const r = setTimeout(settle, 60), r2 = setTimeout(settle, 400);
    if (!full) return () => { clearTimeout(r); clearTimeout(r2); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { clearTimeout(r); clearTimeout(r2); document.body.style.overflow = prev; w?.removeAttribute("data-fullscreen"); };
  }, [full]);

  const solo = full && !ws;
  return (
    <div ref={ref} className={clsx("flex flex-col", solo ? "fixed inset-0 z-[80] bg-white" : className)}>
      <div className="relative min-h-0 flex-1">
        {children}
        <button type="button" onClick={full ? exit : enter} aria-pressed={full} aria-label={full ? "Quitter le plein écran" : "Carte en plein écran"} title={full ? "Quitter le plein écran (Échap)" : "Plein écran"}
          className={clsx("absolute bottom-9 right-2.5 z-10 flex h-10 items-center gap-1.5 rounded-xl text-sm font-semibold shadow-md ring-1 transition-colors", full ? "bg-ink-900 px-3 text-white ring-white/20 hover:bg-ink-800" : "glass w-10 justify-center text-ink-800 ring-black/10 hover:bg-white")}>
          {full ? <><Minimize2 className="size-4" /><span>Quitter</span></> : <Maximize2 className="size-4" />}
        </button>
      </div>
      {solo && banner}
    </div>
  );
}
