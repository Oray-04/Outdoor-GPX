import { DEMO_ROUTES } from "./demo-data";
import { haversine, trackStats, type TrackStats } from "./geo";
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
  /** Zone géographique (commune, ou toutes les communes d'un code postal) : parcours passant à moins de `radiusKm` d'un des centres. */
  place: Place | null;
}
export interface Place { label: string; centers: [number, number][]; radiusKm: number }
export const DEFAULT_FILTERS: Filters = { q: "", sports: [], country: "", region: "", minKm: 0, maxKm: 200, maxGain: 8000, maxHours: 24, difficulties: [], terrains: [], layers: [], loopOnly: false, scope: "all", place: null };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Le parcours passe-t-il à moins de `radiusKm` d'un des centres ? (emprise d'abord, puis distance au point le plus proche) */
export function routeNear(coords: readonly (readonly number[])[], centers: [number, number][], radiusKm: number): boolean {
  if (!coords.length || !centers.length) return false;
  const latPad = radiusKm / 110.5;
  for (const c of centers) {
    const lonPad = radiusKm / (111.3 * Math.max(0.1, Math.cos((c[1] * Math.PI) / 180)));
    let w = Infinity, e = -Infinity, so = Infinity, n = -Infinity;
    for (const p of coords) { if (p[0] < w) w = p[0]; if (p[0] > e) e = p[0]; if (p[1] < so) so = p[1]; if (p[1] > n) n = p[1]; }
    if (c[0] < w - lonPad || c[0] > e + lonPad || c[1] < so - latPad || c[1] > n + latPad) continue;
    const stride = Math.max(1, Math.floor(coords.length / 400));
    for (let i = 0; i < coords.length; i += stride) if (haversine([coords[i][0], coords[i][1]], c) <= radiusKm * 1000) return true;
    const l = coords[coords.length - 1]; if (haversine([l[0], l[1]], c) <= radiusKm * 1000) return true;
  }
  return false;
}

export function filterRoutes(routes: RouteVM[], f: Filters, verified: string[]): RouteVM[] {
  const q = norm(f.q.trim());
  return routes.filter((r) => {
    const km = r.stats.distanceM / 1000;
    if (q && !norm(`${r.name} ${r.region} ${r.country} ${r.description}`).includes(q)) return false;
    if (f.sports.length && !f.sports.includes(r.sport)) return false;
    if (f.place && !routeNear(r.coords, f.place.centers, f.place.radiusKm)) return false;
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
