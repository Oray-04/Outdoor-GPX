"use client";
import type { FormEvent, ReactNode } from "react";
import clsx from "clsx";
import { Loader2, Search } from "lucide-react";

/** Infobulle d'une bulle d'outil : visible au survol ou au focus clavier. */
export function ToolTip({ label }: { label: string }) {
  return <span role="tooltip" className="pointer-events-none absolute left-1/2 top-full z-40 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink-950/90 px-2 py-1 text-[11px] font-semibold text-white opacity-0 shadow transition group-hover/tool:opacity-100 group-focus-within/tool:opacity-100">{label}</span>;
}

/** Bulle d'outil : icône seule, libellé au survol. */
export function ToolBubble({ label, onClick, disabled, on, children, tone = "default", id }: { label: string; onClick: () => void; disabled?: boolean; on?: boolean; children: ReactNode; tone?: "default" | "brand"; id?: string }) {
  return (
    <span className="group/tool relative">
      <button type="button" data-tool={id} onClick={onClick} disabled={disabled} aria-label={label} aria-pressed={on} className={clsx("grid size-10 place-items-center rounded-full shadow-md ring-1 transition disabled:cursor-not-allowed disabled:text-ink-300 lg:size-9", on ? (tone === "brand" ? "bg-pine-700 text-white ring-pine-800" : "bg-ink-900 text-white ring-ink-900") : "glass text-ink-800 ring-black/10 hover:bg-white enabled:hover:-translate-y-px")}>{children}</button>
      <ToolTip label={label} />
    </span>
  );
}

/** Champ de recherche en bulle (barre d'outils de carte). */
export function SearchBubble({ value, onChange, onSubmit, busy, placeholder = "Adresse, lieu, massif…" }: { value: string; onChange: (v: string) => void; onSubmit: (e: FormEvent) => void; busy?: boolean; placeholder?: string }) {
  return (
    <form onSubmit={onSubmit} role="search" className="glass flex h-10 min-w-0 flex-1 items-center gap-1 rounded-full pl-3.5 pr-1 shadow-md ring-1 ring-black/10 sm:max-w-[19rem] sm:flex-none lg:h-9" data-search-bubble>
      <label className="flex min-w-0 flex-1 items-center gap-2"><span className="sr-only">Rechercher un lieu</span><Search className="size-4 shrink-0 text-ink-500" />
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-400" /></label>
      <button className="grid size-8 shrink-0 place-items-center rounded-full bg-pine-600 text-white hover:bg-pine-700 lg:size-7" aria-label="Lancer la recherche">{busy ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}</button>
    </form>
  );
}

/** Décale les commandes de la carte (zoom, nord, calques, plein écran, attributions) à gauche d'un panneau flottant à droite. */
export const PANEL_OFFSET = "lg:[&_.maplibregl-ctrl-top-right]:!right-[22.5rem] lg:[&_.maplibregl-ctrl-bottom-right]:!right-[22.5rem] lg:[&_[data-fs-btn]]:!right-[22.75rem]";
/** Panneau flottant à droite (ordinateur), pleine hauteur de la carte. */
export const FLOAT_RIGHT = "lg:bottom-3 lg:left-auto lg:right-3 lg:top-3 lg:w-[21rem]";
