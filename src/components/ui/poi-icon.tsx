import { glyphPaths } from "@/lib/poi-icons";
import { POI_TYPES, type PoiType } from "@/lib/types";

/** Pastille de pictogramme d'un type de POI (listes, boutons, fiches). */
export function PoiIcon({ type, size = 24, className = "", decorative = false }: { type: PoiType; size?: number; className?: string; decorative?: boolean }) {
  const t = POI_TYPES[type] ?? POI_TYPES.vue; const px = Math.round(size * 0.62);
  return (
    <span className={`inline-grid shrink-0 place-items-center rounded-[30%] text-white shadow-sm ring-1 ring-black/10 ${className}`} style={{ width: size, height: size, background: t.color }} {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": t.label })}>
      <svg width={px} height={px} viewBox="0 0 24 24" aria-hidden="true">
        {glyphPaths(POI_TYPES[type] ? type : "vue").map((g) => g.kind === "f" ? <path key={g.d} d={g.d} fill="currentColor" /> : <path key={g.d} d={g.d} fill="none" stroke="currentColor" strokeWidth={type === "parking" ? 3.4 : 2.4} strokeLinecap="round" strokeLinejoin="round" />)}
      </svg>
    </span>
  );
}
