import { POI_ICON_PATHS } from "@/lib/poi-icons";
import { POI_TYPES, type PoiType } from "@/lib/types";

/** Pastille de pictogramme d'un type de POI (listes, boutons, fiches). */
export function PoiIcon({ type, size = 24, className = "" }: { type: PoiType; size?: number; className?: string }) {
  const t = POI_TYPES[type] ?? POI_TYPES.vue; const k = POI_ICON_PATHS[type] ? type : "vue";
  return (
    <span className={`inline-grid shrink-0 place-items-center rounded-full text-white ${className}`} style={{ width: size, height: size, background: t.color }} role="img" aria-label={t.label}>
      <svg width={Math.round(size * 0.58)} height={Math.round(size * 0.58)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{POI_ICON_PATHS[k].map((d) => <path key={d} d={d} />)}</svg>
    </span>
  );
}
