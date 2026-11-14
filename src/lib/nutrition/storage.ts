"use client";
import { listKey } from "../repo";
import { readStore, writeStore } from "../store";
import type { PlanInput, Product } from "./types";
import { NUTRITION } from "./constants";

/** Catalogue personnel de produits et plans enregistrés (sur l'appareil, comme les parcours). */
export const productsRepo = listKey<Product>("nutrition-products");
export interface SavedPlan { id: string; name: string; savedAt: number; input: Omit<PlanInput, "products"> }
export const plansRepo = listKey<SavedPlan>("nutrition-plans");

/** Saisie vide : les champs chiffrés indispensables restent vides (aucune valeur fictive) ; seuls les choix ont une position par défaut. */
export function emptyInput(): Omit<PlanInput, "products"> {
  return {
    athlete: { weightKg: null, level: "intermediaire", experienceYears: null, tolerance: "moyenne", habit: "occasionnelle" },
    race: { type: "trail", name: "", distanceKm: null, gainM: null, durationMin: null, intensity: "moderee", startTime: "08:00" },
    weather: { tempC: null, humidityPct: null, sky: "couvert", sweat: "inconnu" },
    prefs: { carbOverrideGph: null, intakeOverrideMlH: null, sodiumOverrideMgH: null, foodNotes: "", saltProfile: "inconnu", sweatTest: null, sweatSodium: null, caffeine: { strategy: "aucune", customMgKg: null, sensitivity: "normale", habitualMgDay: null, halfLifeH: null, bedtime: "", doses: null }, productIds: [], drinkId: null, intervalMin: NUTRITION.plan.intervalMin, carryMl: null, refillAtAid: true },
    aid: [],
  };
}
const DRAFT = "nutrition-draft";
/** Brouillon en cours : complété avec les champs ajoutés depuis (compatibilité des anciennes saisies). */
export function loadDraft(): Omit<PlanInput, "products"> {
  const e = emptyInput(), d = readStore<Partial<Omit<PlanInput, "products">> | null>(DRAFT, null);
  if (!d) return e;
  return { athlete: { ...e.athlete, ...d.athlete }, race: { ...e.race, ...d.race }, weather: { ...e.weather, ...d.weather }, prefs: { ...e.prefs, ...d.prefs, caffeine: { ...e.prefs.caffeine, ...d.prefs?.caffeine } }, aid: d.aid ?? [] };
}
export const saveDraft = (v: Omit<PlanInput, "products">) => writeStore(DRAFT, v);
