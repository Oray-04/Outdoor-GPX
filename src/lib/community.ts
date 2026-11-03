import { cloud } from "./cloud";
import { trackStats } from "./geo";
import { difficultyOf, estimateMinutes, type Sport } from "./sports";
import type { RouteVM } from "./route-model";
import type { Pt } from "./types";

export interface CommunityRow { id: string; name: string; sport: string; distance_m: number; gain_m: number; owner_id: string; geometry: { type: "LineString"; coordinates: number[][] } }

/** Parcours publiés dans une emprise (géométrie simplifiée côté base). */
export async function communityInBbox(b: [number, number, number, number], signal?: AbortSignal): Promise<CommunityRow[]> {
  const c = cloud(); if (!c) return [];
  const q = c.rpc("public_routes_in_bbox", { west: b[0], south: b[1], east: b[2], north: b[3], max_rows: 200 });
  const { data, error } = await (signal ? q.abortSignal(signal) : q);
  if (error) throw new Error(error.message);
  return (data ?? []) as CommunityRow[];
}

/** Fiche complète d'un parcours publié par un membre. */
export async function communityRoute(id: string): Promise<RouteVM | null> {
  const c = cloud(); if (!c) return null;
  const { data, error } = await c.rpc("public_route_geojson", { route_id: id });
  if (error) throw new Error(error.message);
  const r = (data as { id: string; name: string; sport: Sport; region: string; country: string; description: string; geometry: { coordinates: number[][] } }[] | null)?.[0];
  if (!r) return null;
  const coords = r.geometry.coordinates.map((p) => [p[0], p[1], p[2] ?? 0] as Pt);
  const stats = trackStats(coords, 3);
  const loop = coords.length > 2 && Math.abs(coords[0][0] - coords[coords.length - 1][0]) < 1e-4 && Math.abs(coords[0][1] - coords[coords.length - 1][1]) < 1e-4;
  return { id: r.id, name: r.name, description: r.description, sport: r.sport, region: r.region, country: r.country, coords, pois: [], waypoints: [], terrain: [], loop, visibility: "public", origin: "community", layer: "community", stats, durationMin: estimateMinutes(r.sport, stats.distanceM, stats.gainM), difficulty: difficultyOf(stats.distanceM, stats.gainM) };
}
