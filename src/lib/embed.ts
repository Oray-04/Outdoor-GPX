import type { Poi, PoiType, Pt } from "./types";
import { POI_TYPES } from "./types";
import { maxDeviation, pointImportance, trackStats } from "./geo";
import type { Sport } from "./sports";
import { SPORTS } from "./sports";

/**
 * Partage par lien et intégration sur un site externe, sans serveur : le parcours (tracé allégé + statistiques exactes + POI)
 * est encodé dans le fragment de l'adresse (#…), qui n'est jamais envoyé à un serveur. Seul le parcours choisi est contenu
 * dans le lien : ni identifiant de compte, ni autres parcours, ni données de l'appareil.
 */
export interface SharedRoute {
  name: string; sport: Sport; region: string; description: string;
  /** Statistiques du tracé complet d'origine (pas du tracé allégé). */
  distanceM: number; gainM: number; lossM: number;
  coords: Pt[]; pois: { type: PoiType; name: string; lng: number; lat: number }[];
  /** Nombre de points du tracé d'origine et écart maximal du tracé allégé (m). */
  sourcePoints: number; maxDevM: number;
}
export const EMBED_MAX_POINTS = 600;

const zig = (n: number) => (n < 0 ? ~(n << 1) : n << 1);
const enc = (n: number) => { let v = zig(Math.round(n)), s = ""; while (v >= 0x20) { s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>>= 5; } return s + String.fromCharCode(v + 63); };
function dec(s: string): number[] { const out: number[] = []; let i = 0; while (i < s.length) { let sh = 0, r = 0, b; do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32 && i <= s.length); out.push(r & 1 ? ~(r >>> 1) : r >>> 1); } return out; }
const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));

/** Encode un parcours pour un lien. Le tracé est allégé aux points les plus importants (≤ `maxPoints`). */
export function encodeShared(r: { name: string; sport: Sport; region: string; description?: string; coords: Pt[]; pois: Poi[] }, maxPoints = EMBED_MAX_POINTS): string {
  const st = trackStats(r.coords, 3), n = r.coords.length;
  let idx = r.coords.map((_, i) => i);
  if (n > maxPoints) { const imp = pointImportance(r.coords); idx = idx.sort((a, b) => imp[b] - imp[a]).slice(0, maxPoints).sort((a, b) => a - b); }
  const pts = idx.map((i) => r.coords[i]); let p = "", la = 0, lo = 0, el = 0;
  for (const c of pts) { const a = Math.round(c[1] * 1e5), o = Math.round(c[0] * 1e5), e = Math.round(c[2]); p += enc(a - la) + enc(o - lo) + enc(e - el); la = a; lo = o; el = e; }
  const payload = { v: 1, n: r.name.slice(0, 120), s: r.sport, g: r.region.slice(0, 80), d: (r.description ?? "").slice(0, 400), t: [Math.round(st.distanceM), Math.round(st.gainM), Math.round(st.lossM), n, Math.round(maxDeviation(r.coords, idx) * 10) / 10], p,
    k: r.pois.slice(0, 40).map((x) => [x.type, x.name.slice(0, 60), Math.round(x.lng * 1e5), Math.round(x.lat * 1e5)]) };
  return b64(JSON.stringify(payload));
}
/** Décode un lien ; renvoie null si le contenu est absent, abîmé ou invalide (jamais d'exception, jamais de HTML interprété). */
export function decodeShared(code: string): SharedRoute | null {
  try {
    const j = JSON.parse(unb64(code)) as { v: number; n: unknown; s: unknown; g: unknown; d: unknown; t: unknown; p: unknown; k: unknown };
    if (j.v !== 1 || typeof j.p !== "string" || !Array.isArray(j.t)) return null;
    const nums = dec(j.p); if (nums.length < 6 || nums.length % 3) return null;
    const coords: Pt[] = []; let la = 0, lo = 0, el = 0;
    for (let i = 0; i < nums.length; i += 3) { la += nums[i]; lo += nums[i + 1]; el += nums[i + 2]; const lat = la / 1e5, lng = lo / 1e5; if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) return null; coords.push([lng, lat, el]); }
    if (coords.length > 5000) return null;
    const t = (j.t as unknown[]).map(Number); const sport = (typeof j.s === "string" && j.s in SPORTS ? j.s : "rando") as Sport;
    const pois = (Array.isArray(j.k) ? j.k : []).slice(0, 40).flatMap((x) => { if (!Array.isArray(x)) return []; const [ty, nm, o, a] = x as [unknown, unknown, unknown, unknown]; const lng = Number(o) / 1e5, lat = Number(a) / 1e5; return typeof ty === "string" && ty in POI_TYPES && Number.isFinite(lng) && Number.isFinite(lat) ? [{ type: ty as PoiType, name: String(nm ?? "").slice(0, 60), lng, lat }] : []; });
    return { name: String(j.n ?? "Parcours").slice(0, 120), sport, region: String(j.g ?? "").slice(0, 80), description: String(j.d ?? "").slice(0, 400), distanceM: t[0] || 0, gainM: t[1] || 0, lossM: t[2] || 0, sourcePoints: t[3] || coords.length, maxDevM: t[4] || 0, coords, pois };
  } catch { return null; }
}

export interface EmbedOptions { stats: boolean; profile: boolean; height: number }
export const DEFAULT_EMBED: EmbedOptions = { stats: true, profile: true, height: 520 };
/** Adresse de la vue intégrable et code HTML (iframe responsive, bac à sable, chargement différé). */
export function embedUrl(origin: string, base: string, code: string, o: EmbedOptions) { return `${origin}${base}/integrer/#d=${code}${o.stats ? "" : "&stats=0"}${o.profile ? "" : "&profil=0"}`; }
export function embedHtml(url: string, title: string, height: number) {
  const t = title.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);
  return `<iframe src="${url}" title="${t}" width="100%" height="${Math.round(height)}" style="border:0;max-width:100%;border-radius:12px" loading="lazy" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups allow-downloads"></iframe>`;
}
export const shareUrl = (origin: string, base: string, code: string) => `${origin}${base}/partage/#d=${code}`;
/** Lit `#d=…&stats=0&profil=0`. */
export function readHash(hash: string): { code: string; stats: boolean; profile: boolean } { const q = new URLSearchParams(hash.replace(/^#/, "")); return { code: q.get("d") ?? "", stats: q.get("stats") !== "0", profile: q.get("profil") !== "0" }; }
