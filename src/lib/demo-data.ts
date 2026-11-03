/**
 * DONNÉES DE DÉMONSTRATION — SYNTHÉTIQUES.
 * Les tracés ci-dessous sont générés algorithmiquement autour de régions réelles ;
 * ils ne correspondent à AUCUN sentier, parcours officiel ou événement existant.
 * Ils seront remplacés par la base de données à l'étape 2.
 */
import { trackStats, type LngLatEle, type TrackStats } from "./geo";
import { estimateMinutes, difficultyOf, type Sport, type Difficulty } from "./sports";

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
  id: string; name: string; sport: Sport; date: string; place: string; region: string;
  formats: { label: string; km: number; dplus: number }[];
}

export const DEMO_EVENTS: DemoEvent[] = [
  { id: "ev-1", name: "Trail de démonstration des Crêtes", sport: "trail", date: "2027-04-18", place: "Lieu de démonstration", region: "Auvergne-Rhône-Alpes", formats: [{ label: "Court", km: 12, dplus: 600 }, { label: "Long", km: 32, dplus: 1800 }] },
  { id: "ev-2", name: "Course de démonstration du Littoral", sport: "course", date: "2027-05-09", place: "Lieu de démonstration", region: "Provence-Alpes-Côte d'Azur", formats: [{ label: "10 km", km: 10, dplus: 120 }, { label: "Semi", km: 21.1, dplus: 260 }] },
  { id: "ev-3", name: "Ultra de démonstration des Lacs", sport: "trail", date: "2027-06-26", place: "Lieu de démonstration", region: "Occitanie", formats: [{ label: "Ultra", km: 85, dplus: 5200 }, { label: "Marathon", km: 44, dplus: 2600 }] },
  { id: "ev-4", name: "Cyclo de démonstration des Volcans", sport: "gravel", date: "2027-09-12", place: "Lieu de démonstration", region: "Auvergne-Rhône-Alpes", formats: [{ label: "Découverte", km: 60, dplus: 900 }, { label: "Expert", km: 120, dplus: 2400 }] },
];

export interface Destination { id: string; name: string; country: string; blurb: string; center: [number, number]; hue: number }
export const DESTINATIONS: Destination[] = [
  { id: "chamonix", name: "Vallée de Chamonix", country: "France", blurb: "Hautes parois et grands sentiers d'altitude.", center: [6.87, 45.92], hue: 205 },
  { id: "vercors", name: "Vercors", country: "France", blurb: "Plateaux calcaires, gorges et forêts profondes.", center: [5.55, 45.07], hue: 150 },
  { id: "pyrenees", name: "Pyrénées centrales", country: "France", blurb: "Cirques glaciaires et lacs d'altitude.", center: [-0.01, 42.73], hue: 215 },
  { id: "dolomites", name: "Dolomites", country: "Italie", blurb: "Pâturages ouverts sous les tours de roche.", center: [11.85, 46.55], hue: 120 },
];
