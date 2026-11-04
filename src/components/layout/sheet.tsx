"use client";
import { useRef, type ReactNode } from "react";
import clsx from "clsx";

export type SheetState = "peek" | "half" | "full";
const ORDER: SheetState[] = ["peek", "half", "full"];
/** Hauteur de la partie toujours visible du panneau (poignée + en-tête). La carte s'arrête au-dessus. */
export const PEEK = "8rem";

export const isMobileViewport = () => typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches;

/**
 * Panneau latéral sur ordinateur ; sur mobile, feuille coulissante en bas de l'écran à trois hauteurs
 * (glisser la poignée ou toucher). L'en-tête reste toujours visible, le contenu défile.
 */
export function Sheet({ state, onState, header, children, className, label = "Panneau", side = "left" }: { state: SheetState; onState: (s: SheetState) => void; header: ReactNode; children: ReactNode; className?: string; label?: string; side?: "left" | "right" }) {
  const y0 = useRef<number | null>(null);
  const step = (dir: 1 | -1) => onState(ORDER[Math.min(2, Math.max(0, ORDER.indexOf(state) + dir))]);
  return (
    <aside data-s={state} aria-label={label}
      className={clsx("absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-2xl bg-white shadow-[0_-10px_30px_rgba(13,27,23,0.18)] transition-[height] duration-300 ease-out",
        "h-[8rem] data-[s=half]:h-[52%] data-[s=full]:h-[calc(100%-0.75rem)]",
        "lg:static lg:z-auto lg:!h-auto lg:shrink-0 lg:rounded-none lg:border-ink-100 lg:shadow-none", side === "left" ? "lg:w-[23rem] lg:border-r" : "lg:w-[22rem] lg:border-l", className)}>
      <div className="shrink-0 touch-pan-x lg:touch-auto"
        onTouchStart={(e) => { y0.current = e.touches[0].clientY; }}
        onTouchEnd={(e) => { if (y0.current == null) return; const dy = y0.current - e.changedTouches[0].clientY; y0.current = null; if (Math.abs(dy) > 36) step(dy > 0 ? 1 : -1); }}>
        <button type="button" onClick={() => step(state === "full" ? -1 : 1)} aria-label={state === "full" ? "Réduire le panneau" : "Agrandir le panneau"} aria-expanded={state !== "peek"}
          className="mx-auto flex h-5 w-full items-center justify-center lg:hidden"><span className="h-1.5 w-10 rounded-full bg-ink-200" /></button>
        {header}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
    </aside>
  );
}
