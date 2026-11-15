"use client";
import { useStore, readStore, writeStore } from "./store";
import type { SavedRoute } from "./types";
import { propagateCommon, syncEvent } from "./poi-sync";

/** Dépôts de données. Tous les accès passent ici. */
const EMPTY: never[] = [];

/** Notifications de modification locale (la synchronisation s'y abonne). */
const changeListeners = new Set<(key: string) => void>();
export const onLocalChange = (cb: (key: string) => void) => { changeListeners.add(cb); return () => { changeListeners.delete(cb); }; };
let applying = false;
/** Exécute `fn` sans déclencher de notification (application de données venues du cloud). */
export const withApplying = <T,>(fn: () => T): T => { applying = true; try { return fn(); } finally { applying = false; } };
const emit = (key: string) => { if (!applying) changeListeners.forEach((cb) => cb(key)); };

export const tombKey = (key: string) => `tomb:${key}`;

export function listKey<T extends { id: string }>(key: string) {
  const get = () => readStore<T[]>(key, EMPTY as T[]);
  return {
    useAll: () => useStore<T[]>(key, EMPTY as T[]),
    getAll: get,
    get: (id: string) => get().find((x) => x.id === id),
    /** Enregistre l'élément en l'horodatant (`_u`) pour la résolution des conflits de synchronisation. */
    upsert: (item: T) => {
      const stamped = { ...item, _u: Date.now() } as unknown as T;
      const all = get(); const i = all.findIndex((x) => x.id === item.id);
      const r = writeStore(key, i >= 0 ? all.map((x) => (x.id === item.id ? stamped : x)) : [stamped, ...all]);
      if (r.ok) emit(key);
      return r;
    },
    /** Supprime l'élément et garde une « pierre tombale » pour propager la suppression. */
    remove: (id: string) => {
      const r = writeStore(key, get().filter((x) => x.id !== id));
      writeStore(tombKey(key), { ...readStore<Record<string, number>>(tombKey(key), {}), [id]: Date.now() });
      if (r.ok) emit(key);
      return r;
    },
    replaceAll: (items: T[]) => writeStore(key, items),
  };
}

const SINGLE_META = "sync:single";
/** Écriture d'une valeur unique (favoris, profil…) avec horodatage de synchronisation. */
export function writeSingle<T>(key: string, value: T) {
  const r = writeStore(key, value);
  if (r.ok) { writeStore(SINGLE_META, { ...readStore<Record<string, number>>(SINGLE_META, {}), [key]: Date.now() }); emit(key); }
  return r;
}
export const singleMeta = () => readStore<Record<string, number>>(SINGLE_META, {});
export const setSingleMeta = (key: string, ts: number) => writeStore(SINGLE_META, { ...singleMeta(), [key]: ts });

const baseRoutes = listKey<SavedRoute>("routes");
/** Parcours : chaque enregistrement réaligne la logistique des événements qui l'utilisent (POI partagés, départ / arrivée). */
export const routesRepo = {
  ...baseRoutes,
  upsert: (r: SavedRoute) => {
    const res = baseRoutes.upsert(r); if (!res.ok) return res;
    // POI communs à plusieurs parcours : la modification est reportée dans chacun
    const others = propagateCommon(r, baseRoutes.getAll()); for (const o of others) baseRoutes.upsert({ ...o, updatedAt: Date.now() });
    syncEventsWithRoutes(others.length ? undefined : r.id); return res;
  },
};
let syncing = false;
/**
 * POI partagés : réaligne les postes des événements liés au parcours `routeId` (ou à tous les parcours) et verse dans les parcours
 * les POI créés par migration d'anciens postes. Idempotent : rien n'est écrit si rien ne change.
 */
export function syncEventsWithRoutes(routeId?: string) {
  if (syncing) return; syncing = true;
  try {
    for (let pass = 0; pass < 2; pass++) { // 2e passe : après versement de POI migrés dans un parcours
      const routes = baseRoutes.getAll(); let addedAny = false;
      for (const ev of eventsRepo.getAll()) {
        if (routeId && !ev.races.some((x) => x.routeId === routeId)) continue;
        const res = syncEvent(ev, routes);
        if (res.ev !== ev) eventsRepo.upsert(res.ev);
        for (const [rid, add] of res.addPois) { const rt = baseRoutes.get(rid); if (!rt) continue; const fresh = add.filter((q) => !rt.pois.some((x) => x.id === q.id)); if (fresh.length) { baseRoutes.upsert({ ...rt, pois: [...rt.pois, ...fresh], updatedAt: Date.now() }); addedAny = true; } }
      }
      if (!addedAny) break;
    }
  } finally { syncing = false; }
}
/** Renomme un parcours : seul le nom change (tracé, altitudes, statistiques et points d'intérêt intacts). Les courses, collections et la bibliothèque lisent le parcours par son identifiant : le nouveau nom s'affiche partout. */
export function renameRoute(id: string, name: string): { ok: boolean; error?: string } {
  const n = name.replace(/\s+/g, " ").trim().slice(0, 120); if (!n) return { ok: false, error: "Le nom ne peut pas être vide." };
  const r = routesRepo.get(id); if (!r) return { ok: false, error: "Parcours introuvable sur cet appareil." };
  if (r.name === n) return { ok: true };
  return routesRepo.upsert({ ...r, name: n, updatedAt: Date.now() });
}

export interface Activity { id: string; name: string; sport: string; startedAt: number; durationS: number; distanceM: number; gainM: number; coords: [number, number, number, number][]; routeId?: string }
export const activitiesRepo = listKey<Activity>("activities");

export interface Collection { id: string; name: string; description: string; routeIds: string[]; visibility?: "prive" | "public"; eventId?: string }
export const collectionsRepo = listKey<Collection>("collections");

export interface Review { id: string; routeId: string; rating: number; comment: string; at: number }
export const reviewsRepo = listKey<Review>("reviews");

export interface Report { id: string; routeId: string; routeName: string; message: string; at: number; status: "ouvert" | "traite" }
export const reportsRepo = listKey<Report>("reports");

export const useFavorites = () => useStore<string[]>("favorites", EMPTY as string[]);
export const toggleFavorite = (id: string) => { const f = readStore<string[]>("favorites", []); writeSingle("favorites", f.includes(id) ? f.filter((x) => x !== id) : [...f, id]); };

export interface Profile { name: string; bio: string; sports: string[]; goalKmMonth: number }
export const DEFAULT_PROFILE: Profile = { name: "", bio: "", sports: [], goalKmMonth: 100 };
export const useProfile = () => useStore<Profile>("profile", DEFAULT_PROFILE);
export const saveProfile = (p: Profile) => writeSingle("profile", p);

import type { EventModel } from "./events";
export const eventsRepo = listKey<EventModel>("events");
export function useAllEvents(): EventModel[] { return eventsRepo.useAll(); }

import { TERRAINS } from "./types";
/** Catégories administrables : types de terrain proposés dans l'éditeur et les filtres. */
export const useTerrains = (): string[] => { const s = useStore<string[] | null>("categories:terrains", null); return s ?? [...TERRAINS]; };
export const saveTerrains = (t: string[]) => writeSingle("categories:terrains", t);

export interface Editorial { announcement: string; announcementOn: boolean }
export const useEditorial = () => useStore<Editorial>("editorial", { announcement: "", announcementOn: false });
export const saveEditorial = (e: Editorial) => writeStore("editorial", e);

export interface RouteLayer { id: string; name: string; color: string; builtin?: boolean }
export const DEFAULT_LAYERS: RouteLayer[] = [
  { id: "mine", name: "Mes parcours", color: "#1e7a58", builtin: true },
  { id: "orga", name: "Parcours d'organisations", color: "#3ba6c9", builtin: true },
];
/** Ancien calque supprimé : ses parcours sont rattachés à « Mes parcours ». */
export const normalizeLayer = (id: string | undefined) => (!id || id === "fkt" ? "mine" : id);
export const useLayers = (): RouteLayer[] => { const s = useStore<RouteLayer[] | null>("layers", null); return (s ?? DEFAULT_LAYERS).filter((l) => l.id !== "fkt"); };
export const saveLayers = (l: RouteLayer[]) => writeSingle("layers", l);
export function deleteLayer(id: string) {
  const cur = readStore<RouteLayer[] | null>("layers", null) ?? DEFAULT_LAYERS;
  saveLayers(cur.filter((l) => l.id !== id || l.builtin));
  for (const r of routesRepo.getAll()) if (r.layer === id) routesRepo.upsert({ ...r, layer: "mine", updatedAt: Date.now() });
}
