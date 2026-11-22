import type { LL } from "./types";
import { cumulative } from "./geo";
import { readStore, writeStore } from "./store";
import { ZONE_KINDS, ZONE_STATUS, type Analysis, type ParcelHit, type ZoneHit, type ZoneKind, type ZoneStatus, type Summary, type RouteLabel } from "./analysis";

/**
 * Analyse cadastrale par parcours (mémorisée) et synthèse de l'événement.
 * Le résultat est conservé sans les contours (trop lourds pour le stockage du navigateur) : tableaux, exports et
 * synthèse restent disponibles après rechargement ; les contours sont redemandés en relançant l'analyse.
 */
export type StoredParcel = Omit<ParcelHit, "geometry">;
export type StoredZone = Omit<ZoneHit, "geometry">;
export interface StoredAnalysis {
  v: 1; routeId: string; routeName: string; sig: string; at: number; routeM: number; nonCadastralM: number;
  parcels: StoredParcel[]; zones: StoredZone[]; summary: Summary; waymarked: RouteLabel[]; warnings: string[]; parcelSource?: string;
  /** portions du tracé par nature de chemin (coloration de la carte) */
  portions?: import("./analysis").Portion[];
}

/** Empreinte du tracé : l'analyse est signalée « à relancer » dès que le parcours est modifié. */
export function routeSig(coords: LL[] | number[][]): string {
  if (coords.length < 2) return "0";
  const len = cumulative(coords.map((c) => [c[0], c[1]] as LL)).at(-1)!;
  const f = coords[0], l = coords[coords.length - 1];
  return `${coords.length}:${f[0].toFixed(5)},${f[1].toFixed(5)}:${l[0].toFixed(5)},${l[1].toFixed(5)}:${Math.round(len)}`;
}

export function toStored(routeId: string, routeName: string, sig: string, a: Analysis): StoredAnalysis {
  return {
    v: 1, routeId, routeName, sig, at: a.at, routeM: a.routeM, nonCadastralM: a.nonCadastralM ?? Math.max(0, a.routeM - a.parcels.reduce((t, p) => t + p.lengthM, 0)),
    parcels: a.parcels.map(({ geometry: _g, ...p }) => { void _g; return p; }), zones: a.zones.map(({ geometry: _g, ...z }) => { void _g; return z; }),
    summary: a.summary, waymarked: a.waymarked, warnings: a.warnings, parcelSource: a.parcelSource, portions: a.portions,
  };
}

const KEY = (routeId: string) => `cadastre:${routeId}`;
export const loadAnalysis = (routeId: string) => readStore<StoredAnalysis | null>(KEY(routeId), null);
/** Enregistre ; si le stockage du navigateur est plein, le résultat reste utilisable pendant la session. */
export function saveAnalysis(s: StoredAnalysis): boolean { return writeStore(KEY(s.routeId), s).ok; }

// ── Synthèse de l'événement ──
export interface SynthRoute { routeId: string; label: string }
export interface SynthParcel extends Omit<StoredParcel, "lengthM" | "fromM" | "passages" | "zoneIds"> {
  /** distance cumulée : somme des longueurs sur chaque parcours (une portion commune à deux parcours compte deux fois) */
  totalM: number; byRoute: { routeId: string; label: string; lengthM: number; fromM?: number }[]; zoneIds: string[];
}
export interface SynthCommune { insee: string; name: string; parcels: number; sharedParcels: number; totalM: number; routes: string[] }
export interface SynthZone extends StoredZone { byRoute: { routeId: string; label: string; lengthM: number }[]; totalM: number }
export interface Synthesis {
  routes: (SynthRoute & { a: StoredAnalysis })[]; missing: SynthRoute[];
  parcels: SynthParcel[]; communes: SynthCommune[]; zones: SynthZone[];
  totals: { parcels: number; shared: number; communes: number; cumulM: number; routesM: number; nonCadastralM: number };
}

const byRef = (a: { commune: string; section: string; numero: string }, b: typeof a) => a.commune.localeCompare(b.commune, "fr") || a.section.localeCompare(b.section) || a.numero.localeCompare(b.numero);

/**
 * Fusion des analyses : chaque parcelle n'apparaît qu'une fois (clé : identifiant cadastral IDU), avec les parcours
 * concernés et la distance de chacun ; de même pour les zonages et les communes.
 * Seules les parcelles réellement parcourues (> 0,5 m) sont comptées ; un simple contact ponctuel est ignoré.
 */
export function synthesize(entries: (SynthRoute & { a: StoredAnalysis | null })[]): Synthesis {
  const routes = entries.filter((e): e is SynthRoute & { a: StoredAnalysis } => !!e.a), missing = entries.filter((e) => !e.a).map(({ routeId, label }) => ({ routeId, label }));
  const P = new Map<string, SynthParcel>(), Z = new Map<string, SynthZone>();
  for (const r of routes) {
    for (const p of r.a.parcels) {
      if (p.lengthM <= 0.5) continue;
      const { lengthM, fromM, passages: _p, zoneIds, ...base } = p; void _p;
      const cur = P.get(p.id) ?? { ...base, totalM: 0, byRoute: [], zoneIds: [] };
      const prev = cur.byRoute.find((b) => b.routeId === r.routeId);
      if (prev) continue; // même tracé fourni deux fois : compté une seule fois
      cur.byRoute.push({ routeId: r.routeId, label: r.label, lengthM, fromM });
      cur.totalM = cur.byRoute.reduce((t, b) => t + b.lengthM, 0);
      for (const z of zoneIds ?? []) if (!cur.zoneIds.includes(z)) cur.zoneIds.push(z);
      P.set(p.id, cur);
    }
    for (const z of r.a.zones) {
      const cur = Z.get(z.id) ?? { ...z, lengthM: 0, byRoute: [], totalM: 0 };
      if (!cur.byRoute.some((b) => b.routeId === r.routeId)) cur.byRoute.push({ routeId: r.routeId, label: r.label, lengthM: z.lengthM });
      cur.totalM = cur.byRoute.reduce((t, b) => t + b.lengthM, 0); cur.lengthM = Math.max(...cur.byRoute.map((b) => b.lengthM));
      Z.set(z.id, cur);
    }
  }
  const parcels = [...P.values()].sort(byRef);
  const C = new Map<string, SynthCommune>();
  for (const p of parcels) {
    const c = C.get(p.insee) ?? { insee: p.insee, name: p.commune, parcels: 0, sharedParcels: 0, totalM: 0, routes: [] };
    c.parcels++; if (p.byRoute.length > 1) c.sharedParcels++; c.totalM += p.totalM;
    for (const b of p.byRoute) if (!c.routes.includes(b.label)) c.routes.push(b.label);
    C.set(p.insee, c);
  }
  const order = (l: string) => routes.findIndex((r) => r.label === l);
  const communes = [...C.values()].map((c) => ({ ...c, routes: c.routes.sort((x, y) => order(x) - order(y)) })).sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const zones = [...Z.values()].sort((a, b) => statusRank(a.status) - statusRank(b.status) || b.totalM - a.totalM);
  const uniqRoutes = new Map(routes.map((r) => [r.routeId, r.a]));
  return {
    routes, missing, parcels, communes, zones,
    totals: { parcels: parcels.length, shared: parcels.filter((p) => p.byRoute.length > 1).length, communes: communes.length, cumulM: parcels.reduce((t, p) => t + p.totalM, 0), routesM: [...uniqRoutes.values()].reduce((t, a) => t + a.routeM, 0), nonCadastralM: [...uniqRoutes.values()].reduce((t, a) => t + a.nonCadastralM, 0) },
  };
}
const statusRank = (s?: ZoneStatus) => (s === "reglementaire" ? 0 : s === "procedure" ? 1 : 2);
export const zoneStatus = (z: { status?: ZoneStatus; kind: ZoneKind }): ZoneStatus => z.status ?? ZONE_KINDS[z.kind]?.status ?? "vigilance";

/** Communes d'une analyse : nombre de parcelles et distance. */
export function communesOf(a: StoredAnalysis) {
  const m = new Map<string, { insee: string; name: string; parcels: number; lengthM: number }>();
  for (const p of a.parcels) { if (p.lengthM <= 0.5) continue; const c = m.get(p.insee) ?? { insee: p.insee, name: p.commune, parcels: 0, lengthM: 0 }; c.parcels++; c.lengthM += p.lengthM; m.set(p.insee, c); }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, "fr"));
}
/** Parcelles réellement parcourues, dans l'ordre de passage (entrée sur la parcelle). */
export const crossedParcels = (a: StoredAnalysis) => a.parcels.filter((p) => p.lengthM > 0.5).sort((x, y) => (x.fromM ?? 0) - (y.fromM ?? 0));
/** Parcelles seulement touchées (contact ponctuel, tracé sur la limite) : listées à part, sans distance. */
export const touchedParcels = (a: StoredAnalysis) => a.parcels.filter((p) => p.lengthM <= 0.5);

// ── CSV (Excel, version française : « ; », UTF-8 avec BOM, CRLF) ──
const cell = (v: string | number | undefined | null) => { const s = v == null ? "" : String(v); const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s) ? `'${s}` : s; return /[";\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe; };
const csv = (rows: (string | number | undefined | null)[][]) => "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
export const kmFr = (m: number, d = 3) => (m / 1000).toFixed(d).replace(".", ",");
const zoneNames = (ids: string[] | undefined, zones: StoredZone[], st: (s: ZoneStatus) => boolean) => (ids ?? []).map((id) => zones.find((z) => z.id === id)).filter((z): z is StoredZone => !!z && st(zoneStatus(z))).map((z) => `${ZONE_KINDS[z.kind]?.label ?? z.nature} : ${z.name}`).join(" | ");

export const ROUTE_CSV_COLUMNS = ["N°", "Commune", "Code INSEE", "Commune absorbée", "Section", "Feuille", "Numéro", "Référence cadastrale", "Identifiant (IDU)", "Surface cadastrale (m²)", "Distance sur la parcelle (km)", "Entrée sur la parcelle (km du parcours)", "Passages", "Réglementation / démarche", "Zones de vigilance"];
export function routeCsv(a: StoredAnalysis): string {
  const rows = crossedParcels(a).map((p, i) => [i + 1, p.commune, p.insee, p.comAbs ?? "", p.section, p.feuille ?? "", p.numero, p.ref, p.id, p.areaM2 || "", kmFr(p.lengthM), p.fromM != null ? kmFr(p.fromM, 2) : "", p.passages ?? 1, zoneNames(p.zoneIds, a.zones, (s) => s !== "vigilance"), zoneNames(p.zoneIds, a.zones, (s) => s === "vigilance")]);
  const touched = touchedParcels(a).map((p) => ["contact", p.commune, p.insee, p.comAbs ?? "", p.section, p.feuille ?? "", p.numero, p.ref, p.id, p.areaM2 || "", "0", p.fromM != null ? kmFr(p.fromM, 2) : "", 0, "", "Tracé en limite de parcelle (contact sans traversée)"]);
  return csv([ROUTE_CSV_COLUMNS, ...rows, ...touched]);
}
export function synthesisCsv(s: Synthesis): string {
  const head = ["Commune", "Code INSEE", "Commune absorbée", "Section", "Feuille", "Numéro", "Référence cadastrale", "Identifiant (IDU)", "Surface cadastrale (m²)", "Parcours concernés", "Nombre de parcours", "Commune à plusieurs parcours", "Distance cumulée (km)", ...s.routes.map((r) => `${r.label} (km)`), "Réglementation / démarche", "Zones de vigilance"];
  const zs = s.zones as StoredZone[];
  const rows = s.parcels.map((p) => [p.commune, p.insee, p.comAbs ?? "", p.section, p.feuille ?? "", p.numero, p.ref, p.id, p.areaM2 || "", p.byRoute.map((b) => b.label).join(" + "), p.byRoute.length, p.byRoute.length > 1 ? "Oui" : "Non", kmFr(p.totalM), ...s.routes.map((r) => { const b = p.byRoute.find((x) => x.routeId === r.routeId); return b ? kmFr(b.lengthM) : ""; }), zoneNames(p.zoneIds, zs, (x) => x !== "vigilance"), zoneNames(p.zoneIds, zs, (x) => x === "vigilance")]);
  return csv([head, ...rows]);
}
export const statusLabel = (s: ZoneStatus) => ZONE_STATUS[s].label;
