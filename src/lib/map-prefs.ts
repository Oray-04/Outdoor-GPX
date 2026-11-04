"use client";
import { useStore, writeStore } from "./store";
import { DEFAULT_BASEMAP } from "./basemaps";

/** Préférences de carte mémorisées sur l'appareil (communes à toutes les cartes du site). */
const ENV_TF = process.env.NEXT_PUBLIC_THUNDERFOREST_KEY ?? "";
export const useBasemapPref = () => useStore<string>("ui:basemap", DEFAULT_BASEMAP);
export const useOverlayPref = () => useStore<string[]>("ui:overlays", []);
export const setBasemapPref = (id: string) => writeStore("ui:basemap", id);
export const setOverlayPref = (ids: string[]) => writeStore("ui:overlays", ids);
/** Clé Thunderforest : variable de build ou saisie dans le navigateur (jamais envoyée à nos serveurs). */
export const useThunderforestKey = (): string => { const k = useStore<string>("tf-key", ""); return ENV_TF || k; };
export const setThunderforestKey = (k: string) => writeStore("tf-key", k.trim());
export const thunderforestFromEnv = Boolean(ENV_TF);
