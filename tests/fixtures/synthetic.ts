/**
 * JEUX D'ESSAI DES TESTS — tracés synthétiques générés algorithmiquement. Ils ne sont plus livrés avec le site
 * (aucune donnée de démonstration n'y est affichée) : ils ne servent qu'à tester les filtres et les calculs.
 */
import { trackStats, type LngLatEle, type TrackStats } from "../../src/lib/geo";
import { estimateMinutes, difficultyOf, type Sport, type Difficulty } from "../../src/lib/sports";

export interface DemoRoute {
  id: string;
  name: string;
  sport: Sport;
  region: string;
  country: string;
  start: [number, number];
  loop: boolean;
  coords: LngLatEle[];
  stats: TrackStats;
  durationMin: number;
  difficulty: Difficulty;
  profile: number[]; // altitude échantillonnée pour les aperçus
  hue: number;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Spec {
  id: string; name: string; sport: Sport; region: string; country: string;
  start: [number, number]; loop: boolean; radiusKm: number; baseEle: number; amp: number;
  seed: number; bearing: number; hue: number;
}

function build(spec: Spec): DemoRoute {
  const r = rng(spec.seed);
  const N = 160;
  const kmLat = 110.574;
  const kmLng = 111.32 * Math.cos((spec.start[1] * Math.PI) / 180);
  const ph1 = r() * 6, ph2 = r() * 6, k = 2 + Math.floor(r() * 2);
  const wob = [r() * 6, r() * 6, r() * 6];
  const coords: LngLatEle[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const a = t * Math.PI * 2;
    let x: number, y: number;
    if (spec.loop) {
      const w = 1 + 0.18 * Math.sin(3 * a + wob[0]) + 0.1 * Math.sin(5 * a + wob[1]);
      x = Math.cos(a) * spec.radiusKm * w - spec.radiusKm;
      y = Math.sin(a) * spec.radiusKm * 0.7 * w;
    } else {
      x = t * spec.radiusKm * 2;
      y = Math.sin(t * 5 + wob[0]) * spec.radiusKm * 0.25 + Math.sin(t * 11 + wob[2]) * spec.radiusKm * 0.06;
    }
    const cb = Math.cos(spec.bearing), sb = Math.sin(spec.bearing);
    const rx = x * cb - y * sb, ry = x * sb + y * cb;
    const base = spec.loop ? 0.5 + 0.5 * Math.sin(k * a + ph1) : 0.5 + 0.5 * Math.sin(t * Math.PI * k + ph1);
    const ele =
      spec.baseEle + spec.amp * (0.75 * base + 0.25 * (0.5 + 0.5 * Math.sin(9 * t * Math.PI + ph2))) + (r() - 0.5) * 2;
    coords.push([
      +(spec.start[0] + rx / kmLng).toFixed(6),
      +(spec.start[1] + ry / kmLat).toFixed(6),
      Math.round(ele),
    ]);
  }
  if (spec.loop) coords[coords.length - 1] = [...coords[0]] as LngLatEle;
  const stats = trackStats(coords, 3);
  return {
    id: spec.id, name: spec.name, sport: spec.sport, region: spec.region, country: spec.country,
    start: [coords[0][0], coords[0][1]], loop: spec.loop, coords, stats,
    durationMin: estimateMinutes(spec.sport, stats.distanceM, stats.gainM),
    difficulty: difficultyOf(stats.distanceM, stats.gainM),
    profile: coords.filter((_, i) => i % 4 === 0).map((c) => c[2]),
    hue: spec.hue,
  };
}

export const DEMO_ROUTES: DemoRoute[] = [
  build({ id: "demo-mont-blanc-boucle", name: "Boucle des Aiguilles (démo)", sport: "trail", region: "Haute-Savoie", country: "France", start: [6.87, 45.92], loop: true, radiusKm: 6.5, baseEle: 1050, amp: 1500, seed: 11, bearing: 0.4, hue: 200 }),
  build({ id: "demo-vercors-crete", name: "Crêtes du plateau (démo)", sport: "rando", region: "Isère", country: "France", start: [5.55, 45.07], loop: true, radiusKm: 4, baseEle: 1000, amp: 650, seed: 23, bearing: 1.1, hue: 150 }),
  build({ id: "demo-calanques-run", name: "Falaises et criques (démo)", sport: "course", region: "Bouches-du-Rhône", country: "France", start: [5.44, 43.21], loop: false, radiusKm: 6, baseEle: 5, amp: 260, seed: 37, bearing: 0.2, hue: 190 }),
  build({ id: "demo-pyrenees-cirque", name: "Cirque et lacs (démo)", sport: "rando", region: "Hautes-Pyrénées", country: "France", start: [-0.01, 42.73], loop: true, radiusKm: 5, baseEle: 1400, amp: 1100, seed: 41, bearing: 2.4, hue: 210 }),
  build({ id: "demo-sancy-gravel", name: "Volcans en gravel (démo)", sport: "gravel", region: "Puy-de-Dôme", country: "France", start: [2.81, 45.53], loop: true, radiusKm: 14, baseEle: 800, amp: 620, seed: 53, bearing: 0.9, hue: 30 }),
  build({ id: "demo-dolomites-vtt", name: "Plateaux et pâturages (démo)", sport: "vtt", region: "Tyrol du Sud", country: "Italie", start: [11.85, 46.55], loop: true, radiusKm: 9, baseEle: 1300, amp: 900, seed: 67, bearing: 1.8, hue: 120 }),
  build({ id: "demo-bretagne-marche", name: "Sentier côtier (démo)", sport: "marche", region: "Finistère", country: "France", start: [-4.62, 48.38], loop: false, radiusKm: 7, baseEle: 5, amp: 70, seed: 79, bearing: 3.6, hue: 205 }),
  build({ id: "demo-alpes-velo", name: "Grand col en route (démo)", sport: "velo", region: "Isère", country: "France", start: [6.0, 45.2], loop: false, radiusKm: 18, baseEle: 700, amp: 1500, seed: 83, bearing: 0.1, hue: 170 }),
];

export const getDemoRoute = (id: string) => DEMO_ROUTES.find((r) => r.id === id);

export interface DemoEvent {
  id: string; name: string; date: string; place: string; region: string;
  /** Chaque format est relié à un parcours de démonstration (distance et D+ en sont déduits). */
  formats: { label: string; routeId: string }[];
}

export const DEMO_EVENTS: DemoEvent[] = [
  { id: "ev-1", name: "Trail de démonstration des Crêtes", date: "2027-04-18", place: "Lieu de démonstration", region: "Auvergne-Rhône-Alpes", formats: [{ label: "Découverte", routeId: "demo-vercors-crete" }, { label: "Grand parcours", routeId: "demo-mont-blanc-boucle" }] },
  { id: "ev-2", name: "Course de démonstration du Littoral", date: "2027-05-09", place: "Lieu de démonstration", region: "Provence-Alpes-Côte d'Azur", formats: [{ label: "Côtier", routeId: "demo-calanques-run" }] },
  { id: "ev-3", name: "Trail de démonstration des Lacs", date: "2027-06-26", place: "Lieu de démonstration", region: "Occitanie", formats: [{ label: "Cirque et lacs", routeId: "demo-pyrenees-cirque" }] },
  { id: "ev-4", name: "Cyclo de démonstration des Volcans", date: "2027-09-12", place: "Lieu de démonstration", region: "Auvergne-Rhône-Alpes", formats: [{ label: "Gravel", routeId: "demo-sancy-gravel" }, { label: "Route", routeId: "demo-alpes-velo" }] },
];


import type { RouteVM } from "../../src/lib/route-model";
import type { EventModel } from "../../src/lib/events";
export const DEMO_VMS: RouteVM[] = DEMO_ROUTES.map((d) => ({ id: d.id, name: d.name, description: "Tracé synthétique de test.", sport: d.sport, region: d.region, country: d.country, coords: d.coords, pois: [], waypoints: [], terrain: [], loop: d.loop, visibility: "public", origin: "community", layer: "mine", stats: d.stats, durationMin: d.durationMin, difficulty: d.difficulty }));
export const DEMO_EVENT_MODELS: EventModel[] = DEMO_EVENTS.map((e) => ({
  id: e.id, name: e.name, organizer: "Organisateur de test", date: e.date, place: e.place, region: e.region, description: "", rules: "", practical: "", registrationUrl: "",
  races: e.formats.map((f, i) => { const r = DEMO_VMS.find((v) => v.id === f.routeId)!; return { id: `${e.id}-r${i}`, label: f.label, sport: r.sport, distanceKm: +(r.stats.distanceM / 1000).toFixed(1), gainM: Math.round(r.stats.gainM), startTime: "08:00", maxHours: Math.ceil(r.durationMin / 60) + 2, routeId: f.routeId }; }),
  posts: [], volunteers: [], team: [], origin: "community" as const, createdAt: 0, visibility: "public" as const,
}));
