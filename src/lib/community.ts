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

// ── Événements, collections et pages d'organisateur publiés par les membres ──
import type { EventModel, Race } from "./events";

export interface EventRow { id: string; owner_id: string; name: string; organizer: string; date: string; place: string; region: string; description: string; rules: string; practical: string; registration_url: string; races: Race[]; collection_id: string | null }
export const eventFromRow = (r: EventRow): EventModel => ({
  id: r.id, name: r.name, organizer: r.organizer, date: r.date, place: r.place, region: r.region, description: r.description, rules: r.rules, practical: r.practical,
  registrationUrl: r.registration_url, races: Array.isArray(r.races) ? r.races : [], posts: [], volunteers: [], team: [], origin: "community", createdAt: 0, visibility: "public", collectionId: r.collection_id ?? undefined, ownerId: r.owner_id,
});

/** Événements publiés à venir. */
export async function communityEvents(): Promise<EventModel[]> {
  const c = cloud(); if (!c) return [];
  const { data, error } = await c.from("public_events").select("*").gte("date", new Date().toISOString().slice(0, 10)).order("date").limit(200);
  if (error) throw new Error(error.message);
  return ((data ?? []) as EventRow[]).map(eventFromRow);
}
export async function communityEvent(id: string): Promise<EventModel | null> {
  const c = cloud(); if (!c) return null;
  const { data, error } = await c.from("public_events").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? eventFromRow(data as EventRow) : null;
}

interface RouteByIds { id: string; name: string; sport: Sport; region: string; country: string; distance_m: number; gain_m: number; loss_m: number; min_ele: number; max_ele: number; owner_id: string; geometry: { coordinates: number[][] } }
/** Parcours publiés (version simplifiée pour l'affichage) ; statistiques exactes issues de la base. */
export async function communityRoutesByIds(ids: string[]): Promise<RouteVM[]> {
  const c = cloud(); if (!c || !ids.length) return [];
  const { data, error } = await c.rpc("public_routes_by_ids", { ids });
  if (error) throw new Error(error.message);
  const byId = new Map(((data ?? []) as RouteByIds[]).map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is RouteByIds => !!r).map((r) => {
    const coords = r.geometry.coordinates.map((p) => [p[0], p[1], p[2] ?? 0] as Pt);
    const stats = { distanceM: r.distance_m, gainM: r.gain_m, lossM: r.loss_m, minEle: r.min_ele, maxEle: r.max_ele };
    const loop = coords.length > 2 && Math.abs(coords[0][0] - coords.at(-1)![0]) < 1e-4 && Math.abs(coords[0][1] - coords.at(-1)![1]) < 1e-4;
    return { id: r.id, name: r.name, description: "", sport: r.sport, region: r.region, country: r.country, coords, pois: [], waypoints: [], terrain: [], loop, visibility: "public" as const, origin: "community" as const, layer: "community", stats, durationMin: estimateMinutes(r.sport, stats.distanceM, stats.gainM), difficulty: difficultyOf(stats.distanceM, stats.gainM) };
  });
}

export interface CollectionData { id: string; title: string; description: string; ownerId: string; ownerName: string; eventId?: string; routeIds: string[]; routes: RouteVM[] }
interface CollectionRow { id: string; title: string; description: string; owner_id: string; event_id: string | null; route_ids: string[] }
async function ownerName(id: string): Promise<string> {
  const c = cloud(); const { data } = await c!.from("profiles").select("display_name").eq("id", id).maybeSingle();
  return data?.display_name || "Organisateur";
}
export async function communityCollection(id: string): Promise<CollectionData | null> {
  const c = cloud(); if (!c) return null;
  const { data, error } = await c.from("public_collections").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const r = data as CollectionRow;
  const [routes, name] = await Promise.all([communityRoutesByIds(r.route_ids), ownerName(r.owner_id)]);
  return { id: r.id, title: r.title, description: r.description, ownerId: r.owner_id, ownerName: name, eventId: r.event_id ?? undefined, routeIds: r.route_ids, routes };
}

export interface OwnerPage { id: string; name: string; bio: string; collections: { id: string; title: string; description: string; count: number }[]; events: EventModel[] }
export async function communityOwner(ownerId: string): Promise<OwnerPage | null> {
  const c = cloud(); if (!c) return null;
  const [p, cols, evs] = await Promise.all([
    c.from("profiles").select("id,display_name,bio").eq("id", ownerId).maybeSingle(),
    c.from("public_collections").select("id,title,description,route_ids").eq("owner_id", ownerId).order("updated_at", { ascending: false }).limit(100),
    c.from("public_events").select("*").eq("owner_id", ownerId).order("date").limit(100),
  ]);
  if (p.error || cols.error || evs.error) throw new Error((p.error ?? cols.error ?? evs.error)!.message);
  if (!p.data) return null;
  return { id: ownerId, name: p.data.display_name || "Organisateur", bio: p.data.bio ?? "",
    collections: (cols.data ?? []).map((x) => ({ id: x.id, title: x.title, description: x.description, count: x.route_ids.length })), events: ((evs.data ?? []) as EventRow[]).map(eventFromRow) };
}
