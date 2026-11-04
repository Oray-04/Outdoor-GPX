import { DEMO_ROUTES } from "./demo-data";
import { trackStats, type TrackStats } from "./geo";
import { difficultyOf, estimateMinutes, type Difficulty, type Sport } from "./sports";
import type { Poi, Pt, SavedRoute, Visibility } from "./types";

/** Vue unifiée d'un parcours (démo ou enregistré) pour les listes et les fiches. */
export interface RouteVM {
  id: string; name: string; description: string; sport: Sport; region: string; country: string;
  coords: Pt[]; pois: Poi[]; waypoints: { lng: number; lat: number }[]; terrain: string[]; loop: boolean; visibility: Visibility;
  origin: "demo" | "mine" | "community"; layer: string; sourceUrl?: string; stats: TrackStats; durationMin: number; difficulty: Difficulty; updatedAt?: number;
}

export const isClosedTrack = (c: Pt[]) => c.length > 2 && Math.abs(c[0][0] - c[c.length - 1][0]) < 1e-4 && Math.abs(c[0][1] - c[c.length - 1][1]) < 1e-4;

export function fromSaved(r: SavedRoute): RouteVM {
  const stats = trackStats(r.coords, 3);
  return { id: r.id, name: r.name, description: r.description, sport: r.sport, region: r.region, country: r.country, coords: r.coords, pois: r.pois, waypoints: r.source === "creation" ? r.waypoints : [], terrain: r.terrain, loop: isClosedTrack(r.coords), visibility: r.visibility, origin: "mine", layer: r.layer === "fkt" || !r.layer ? "mine" : r.layer, sourceUrl: r.sourceUrl, stats, durationMin: estimateMinutes(r.sport, stats.distanceM, stats.gainM), difficulty: difficultyOf(stats.distanceM, stats.gainM), updatedAt: r.updatedAt };
}

export const DEMO_VMS: RouteVM[] = DEMO_ROUTES.map((d) => ({ id: d.id, name: d.name, description: "Tracé de démonstration généré automatiquement. Il ne correspond à aucun sentier réel.", sport: d.sport, region: d.region, country: d.country, coords: d.coords, pois: [], waypoints: [], terrain: [], loop: d.loop, visibility: "public", origin: "demo", layer: "demo", stats: d.stats, durationMin: d.durationMin, difficulty: d.difficulty }));

export const hueOf = (id: string) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360; return 120 + (h % 110); };
export const sparkOf = (c: Pt[], n = 50) => { const step = Math.max(1, Math.floor(c.length / n)); const out = c.filter((_, i) => i % step === 0).map((p) => p[2]); return out.length > 1 ? out : [0, 0]; };

export interface Filters {
  q: string; sports: string[]; country: string; region: string; minKm: number; maxKm: number; maxGain: number; maxHours: number;
  difficulties: string[]; terrains: string[]; layers: string[]; loopOnly: boolean; scope: "all" | "public" | "private" | "verified" | "demo";
}
export const DEFAULT_FILTERS: Filters = { q: "", sports: [], country: "", region: "", minKm: 0, maxKm: 200, maxGain: 8000, maxHours: 24, difficulties: [], terrains: [], layers: [], loopOnly: false, scope: "all" };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function filterRoutes(routes: RouteVM[], f: Filters, verified: string[]): RouteVM[] {
  const q = norm(f.q.trim());
  return routes.filter((r) => {
    const km = r.stats.distanceM / 1000;
    if (q && !norm(`${r.name} ${r.region} ${r.country} ${r.description}`).includes(q)) return false;
    if (f.sports.length && !f.sports.includes(r.sport)) return false;
    if (f.country && r.country !== f.country) return false;
    if (f.region && r.region !== f.region) return false;
    if (km < f.minKm || km > f.maxKm) return false;
    if (r.stats.gainM > f.maxGain) return false;
    if (r.durationMin / 60 > f.maxHours) return false;
    if (f.difficulties.length && !f.difficulties.includes(r.difficulty)) return false;
    if (f.terrains.length && !f.terrains.some((t) => r.terrain.includes(t))) return false;
    if (f.layers.length && !f.layers.includes(r.layer)) return false;
    if (f.loopOnly && !r.loop) return false;
    if (f.scope === "public" && !(r.visibility === "public" && r.origin === "mine")) return false;
    if (f.scope === "private" && !(r.visibility === "prive" && r.origin === "mine")) return false;
    if (f.scope === "verified" && !verified.includes(r.id)) return false;
    if (f.scope === "demo" && r.origin !== "demo") return false;
    return true;
  });
}
