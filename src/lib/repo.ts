"use client";
import { useStore, readStore, writeStore } from "./store";
import type { SavedRoute } from "./types";

/** Dépôts de données. Tous les accès passent ici. */
const EMPTY: never[] = [];

export function listKey<T extends { id: string }>(key: string) {
  const get = () => readStore<T[]>(key, EMPTY as T[]);
  return {
    useAll: () => useStore<T[]>(key, EMPTY as T[]),
    getAll: get,
    get: (id: string) => get().find((x) => x.id === id),
    upsert: (item: T) => { const all = get(); const i = all.findIndex((x) => x.id === item.id); const next = i >= 0 ? all.map((x) => (x.id === item.id ? item : x)) : [item, ...all]; return writeStore(key, next); },
    remove: (id: string) => writeStore(key, get().filter((x) => x.id !== id)),
    replaceAll: (items: T[]) => writeStore(key, items),
  };
}

export const routesRepo = listKey<SavedRoute>("routes");

export interface Activity { id: string; name: string; sport: string; startedAt: number; durationS: number; distanceM: number; gainM: number; coords: [number, number, number, number][]; routeId?: string }
export const activitiesRepo = listKey<Activity>("activities");

export interface Collection { id: string; name: string; description: string; routeIds: string[] }
export const collectionsRepo = listKey<Collection>("collections");

export interface Review { id: string; routeId: string; rating: number; comment: string; at: number }
export const reviewsRepo = listKey<Review>("reviews");

export interface Report { id: string; routeId: string; routeName: string; message: string; at: number; status: "ouvert" | "traite" }
export const reportsRepo = listKey<Report>("reports");

export const useFavorites = () => useStore<string[]>("favorites", EMPTY as string[]);
export const toggleFavorite = (id: string) => { const f = readStore<string[]>("favorites", []); writeStore("favorites", f.includes(id) ? f.filter((x) => x !== id) : [...f, id]); };

export interface Profile { name: string; bio: string; sports: string[]; goalKmMonth: number }
export const DEFAULT_PROFILE: Profile = { name: "", bio: "", sports: [], goalKmMonth: 100 };
export const useProfile = () => useStore<Profile>("profile", DEFAULT_PROFILE);
export const saveProfile = (p: Profile) => writeStore("profile", p);

import type { EventModel } from "./events";
import { DEMO_EVENT_MODELS } from "./events";
import { useMemo } from "react";
export const eventsRepo = listKey<EventModel>("events");
export function useAllEvents(): EventModel[] {
  const mine = eventsRepo.useAll();
  return useMemo(() => [...mine, ...DEMO_EVENT_MODELS], [mine]);
}
