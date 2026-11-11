"use client";
import { useStore, writeStore } from "./store";
import { DEFAULT_BASEMAP } from "./basemaps";
import type { Engine } from "./routing";

/** Préférences de carte mémorisées sur l'appareil (communes à toutes les cartes du site). */
const ENV_TF = process.env.NEXT_PUBLIC_THUNDERFOREST_KEY ?? "";
/** `scope` : préférence propre à une page (ex. « explorer », dont le fond par défaut est OpenStreetMap) ; sinon préférence commune. */
const SCOPE_DEFAULT: Record<string, string> = { explorer: "osm" };
const baseKey = (scope?: string) => (scope ? `ui:basemap:${scope}` : "ui:basemap");
export const useBasemapPref = (scope?: string) => useStore<string>(baseKey(scope), (scope && SCOPE_DEFAULT[scope]) || DEFAULT_BASEMAP);
export const useOverlayPref = () => useStore<string[]>("ui:overlays", []);
export const setBasemapPref = (id: string, scope?: string) => writeStore(baseKey(scope), id);
export const setOverlayPref = (ids: string[]) => writeStore("ui:overlays", ids);
/** Clé Thunderforest : variable de build ou saisie dans le navigateur (jamais envoyée à nos serveurs). */
export const useThunderforestKey = (): string => { const k = useStore<string>("tf-key", ""); return ENV_TF || k; };
export const setThunderforestKey = (k: string) => writeStore("tf-key", k.trim());
export const thunderforestFromEnv = Boolean(ENV_TF);

/** Moteur de tracé choisi dans l'éditeur. */
export const useEnginePref = () => useStore<Engine>("ui:engine", "auto");
export const setEnginePref = (e: Engine) => writeStore("ui:engine", e);
