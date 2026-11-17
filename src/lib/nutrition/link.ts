import { trackStats } from "../geo";
import { positionOnTrack, postsOfRace, type EventModel } from "../events";
import type { SavedRoute } from "../types";
import type { AidStation, PlanInput } from "./types";

/**
 * Course de nutrition reliée à un parcours ou à la course d'un événement : distance, dénivelé, heure de départ
 * et ravitaillements repris de ces données (aucune ressaisie). Utilisé à la sélection et par le bouton « Actualiser ».
 */
type V = Omit<PlanInput, "products">;
type NewId = () => string;

export function aidFromRoute(rt: Pick<SavedRoute, "coords" | "pois">, newId: NewId): AidStation[] {
  return rt.pois.filter((p) => p.type === "ravito" || p.type === "eau").map((p) => ({ id: newId(), name: p.name || (p.type === "eau" ? "Point d'eau" : "Ravitaillement"), km: Math.round(positionOnTrack(rt.coords, p.lng, p.lat).km * 10) / 10, etaMin: null, water: true, food: p.type === "ravito" })).sort((a, b) => (a.km ?? 0) - (b.km ?? 0));
}

export function linkEventRace(v: V, ev: EventModel, raceId: string, rt: SavedRoute, newId: NewId): V {
  const rc = ev.races.find((r) => r.id === raceId); if (!rc) return v;
  const s = trackStats(rt.coords, 3), km = Math.round(s.distanceM / 100) / 10;
  const posts = postsOfRace(ev.posts, rc.id).filter((p) => (p.kind === "ravito" || p.kind === "eau") && p.km > 0 && p.km < km).sort((a, b) => a.km - b.km);
  const aid = posts.length ? posts.map((p) => ({ id: newId(), name: p.name || (p.kind === "eau" ? "Point d'eau" : "Ravitaillement"), km: Math.round(p.km * 10) / 10, etaMin: null, water: true, food: p.kind === "ravito" })) : aidFromRoute(rt, newId);
  return { ...v, race: { ...v.race, eventRace: { eventId: ev.id, raceId: rc.id }, routeId: rt.id, name: `${ev.name} — ${rc.label}`, distanceKm: km, gainM: Math.round(s.gainM), startTime: /^\d{1,2}:\d{2}$/.test(rc.startTime) ? rc.startTime : v.race.startTime, type: km > 80 ? "ultra" : rc.sport === "course" ? "route" : "trail" }, aid: aid.length ? aid : v.aid };
}

export function linkRoute(v: V, rt: SavedRoute, newId: NewId): V {
  const s = trackStats(rt.coords, 3), km = Math.round(s.distanceM / 100) / 10, aid = aidFromRoute(rt, newId);
  return { ...v, race: { ...v.race, eventRace: undefined, routeId: rt.id, name: v.race.name || rt.name, distanceKm: km, gainM: Math.round(s.gainM), type: km > 80 ? "ultra" : rt.sport === "course" ? "route" : "trail" }, aid: aid.length ? aid : v.aid };
}

/** Reprend les dernières données du parcours ou de la course liée (parcours modifié, ravitaillements déplacés…). */
export function refreshLinked(v: V, events: EventModel[], routes: SavedRoute[], newId: NewId): { v: V; note: string } {
  const er = v.race.eventRace;
  if (er) {
    const ev = events.find((e) => e.id === er.eventId), rc = ev?.races.find((r) => r.id === er.raceId), rt = rc?.routeId ? routes.find((r) => r.id === rc.routeId) : undefined;
    if (ev && rt) { const n = linkEventRace(v, ev, er.raceId, rt, newId); return { v: n, note: `Course « ${n.race.name} » reprise : ${String(n.race.distanceKm).replace(".", ",")} km, ${n.race.gainM} m D+, ${n.aid.length} ravitaillement(s).` }; }
    return { v, note: "La course liée n'existe plus sur cet appareil : vos données saisies sont conservées." };
  }
  if (v.race.routeId) {
    const rt = routes.find((r) => r.id === v.race.routeId);
    if (rt) { const n = linkRoute(v, rt, newId); return { v: n, note: `Parcours « ${rt.name} » repris : ${String(n.race.distanceKm).replace(".", ",")} km, ${n.race.gainM} m D+, ${n.aid.length} ravitaillement(s).` }; }
    return { v, note: "Le parcours lié n'existe plus sur cet appareil : vos données saisies sont conservées." };
  }
  return { v, note: "Produits, plans enregistrés et calculs rechargés." };
}
