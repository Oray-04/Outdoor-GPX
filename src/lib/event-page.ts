import type { EventModel } from "./events";
import { readStore, writeStore, useStore } from "./store";

/**
 * Page publique personnalisée d'un événement : identité visuelle (bandeau, fond, couleurs) et blocs ordonnés.
 * Un événement sans personnalisation garde la page standard, inchangée : rien n'est imposé aux autres événements.
 */
export type BlockKind = "presentation" | "chiffres" | "compte" | "inscription" | "courses" | "plan" | "cartes" | "pratique" | "reglement" | "texte";
export const BLOCKS: Record<BlockKind, { label: string; hint: string; multiple?: boolean }> = {
  presentation: { label: "Présentation", hint: "Le texte de présentation de l'événement." },
  chiffres: { label: "Chiffres clés", hint: "Nombre de courses, distances, dénivelé, date et lieu." },
  compte: { label: "Compte à rebours", hint: "Jours restants avant le départ." },
  inscription: { label: "Inscription", hint: "Bouton vers votre page d'inscription." },
  courses: { label: "Liste des courses", hint: "Chaque course, avec son GPX." },
  plan: { label: "Carte des coureurs", hint: "La carte que vous avez importée (Logistique › Carte des coureurs)." },
  cartes: { label: "Cartes des parcours", hint: "Carte et chiffres de chaque course." },
  pratique: { label: "Informations pratiques", hint: "Accès, horaires, parkings…" },
  reglement: { label: "Règlement", hint: "Le règlement de l'épreuve." },
  texte: { label: "Bloc de texte", hint: "Titre et texte libres (partenaires, programme…).", multiple: true },
};
export interface PageBlock { id: string; kind: BlockKind; hidden?: boolean; title?: string; text?: string }
export type Background = "clair" | "teinte" | "sombre";
export type BannerStyle = "degrade" | "uni" | "image";
export interface PageTheme { primary: string; accent: string; background: Background; banner: BannerStyle; bannerImage?: string; /** cadrage vertical de l'image (0 = haut, 100 = bas) */ bannerFocus?: number }
export interface EventPageDesign { v: 1; theme: PageTheme; blocks: PageBlock[]; updatedAt?: number }

export const PRESETS: { id: string; label: string; primary: string; accent: string }[] = [
  { id: "foret", label: "Forêt", primary: "#1e7a58", accent: "#cdb07a" },
  { id: "bleu-rose", label: "Bleu et rose", primary: "#2457d6", accent: "#e5548e" },
  { id: "glacier", label: "Glacier", primary: "#1f6f99", accent: "#8fd3e8" },
  { id: "volcan", label: "Volcan", primary: "#c2410c", accent: "#3b2f2f" },
  { id: "nuit", label: "Nuit étoilée", primary: "#1e293b", accent: "#f59e0b" },
  { id: "lavande", label: "Lavande", primary: "#6d4bc4", accent: "#f2a7c3" },
];
/** Blocs de la page standard, dans le même ordre : personnaliser part de ce qui existe déjà. */
export const DEFAULT_BLOCKS: BlockKind[] = ["presentation", "courses", "cartes", "pratique", "reglement"];
let n = 0;
export const blockId = () => `b${Date.now().toString(36)}${(n++).toString(36)}`;
export function defaultDesign(): EventPageDesign {
  return { v: 1, theme: { primary: PRESETS[0].primary, accent: PRESETS[0].accent, background: "clair", banner: "degrade", bannerFocus: 50 }, blocks: DEFAULT_BLOCKS.map((kind) => ({ id: blockId(), kind })) };
}

// ── Couleurs : texte toujours lisible, quelles que soient les couleurs choisies ──
const HEX = /^#[0-9a-f]{6}$/i;
const rgbOf = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hexOf = (c: number[]) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
export const mix = (a: string, b: string, t: number) => { const x = rgbOf(a), y = rgbOf(b); return hexOf(x.map((v, i) => v + (y[i] - v) * t)); };
export function luminance(h: string) { const [r, g, b] = rgbOf(h).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
export const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
/** Texte posé sur une couleur : blanc ou encre, le plus lisible. */
export const onColor = (bg: string) => (contrast(bg, "#ffffff") >= contrast(bg, "#0d1b17") ? "#ffffff" : "#0d1b17");
/** Assombrit ou éclaircit une couleur jusqu'au contraste demandé sur un fond (titres, liens). */
export function readable(fg: string, bg: string, min = 4.5) {
  const dark = luminance(bg) > 0.4; let c = fg;
  for (let i = 0; i < 20 && contrast(c, bg) < min; i++) c = mix(c, dark ? "#000000" : "#ffffff", 0.12);
  return c;
}
export interface ThemeVars { bg: string; card: string; ink: string; muted: string; line: string; primary: string; onPrimary: string; accent: string; onAccent: string; link: string; dark: boolean }
export function themeVars(t: PageTheme): ThemeVars {
  const dark = t.background === "sombre";
  const bg = dark ? "#0f1519" : t.background === "teinte" ? mix(t.accent, "#ffffff", 0.9) : "#f6f5f1";
  const card = dark ? "#18222a" : "#ffffff";
  return { bg, card, ink: dark ? "#eef2ef" : "#0d1b17", muted: dark ? "#a9b5af" : "#55655e", line: dark ? "#2a3640" : "#e3e7e1", primary: t.primary, onPrimary: onColor(t.primary), accent: t.accent, onAccent: onColor(t.accent), link: readable(t.primary, card), dark };
}

// ── Nettoyage : données reçues d'un autre appareil ou de la base publique ──
const KINDS = new Set(Object.keys(BLOCKS));
const IMG = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
export const MAX_IMAGE_CHARS = 700_000;
export function normalizeDesign(raw: unknown): EventPageDesign | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Partial<EventPageDesign>, t = (r.theme ?? {}) as Partial<PageTheme>;
  const theme: PageTheme = {
    primary: HEX.test(t.primary ?? "") ? t.primary! : PRESETS[0].primary, accent: HEX.test(t.accent ?? "") ? t.accent! : PRESETS[0].accent,
    background: (["clair", "teinte", "sombre"] as const).includes(t.background as Background) ? t.background! : "clair",
    banner: (["degrade", "uni", "image"] as const).includes(t.banner as BannerStyle) ? t.banner! : "degrade",
    bannerFocus: typeof t.bannerFocus === "number" ? Math.max(0, Math.min(100, Math.round(t.bannerFocus))) : 50,
  };
  // image intégrée uniquement (jamais d'adresse externe : pas de suivi ni de contenu tiers)
  if (typeof t.bannerImage === "string" && t.bannerImage.length <= MAX_IMAGE_CHARS && IMG.test(t.bannerImage)) theme.bannerImage = t.bannerImage;
  if (theme.banner === "image" && !theme.bannerImage) theme.banner = "degrade";
  const seen = new Set<string>(), blocks: PageBlock[] = [];
  for (const b of Array.isArray(r.blocks) ? r.blocks.slice(0, 30) : []) {
    if (!b || typeof b !== "object" || !KINDS.has(b.kind)) continue;
    if (!BLOCKS[b.kind as BlockKind].multiple && blocks.some((x) => x.kind === b.kind)) continue;
    let id = typeof b.id === "string" && b.id.length <= 40 ? b.id : blockId(); if (seen.has(id)) id = blockId(); seen.add(id);
    blocks.push({ id, kind: b.kind, ...(b.hidden ? { hidden: true } : {}), ...(typeof b.title === "string" ? { title: b.title.slice(0, 120) } : {}), ...(typeof b.text === "string" ? { text: b.text.slice(0, 5000) } : {}) });
  }
  return { v: 1, theme, blocks, updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : undefined };
}

// ── Modifications ──
export function moveBlock(d: EventPageDesign, id: string, dir: -1 | 1): EventPageDesign {
  const i = d.blocks.findIndex((b) => b.id === id), j = i + dir; if (i < 0 || j < 0 || j >= d.blocks.length) return d;
  const blocks = [...d.blocks]; [blocks[i], blocks[j]] = [blocks[j], blocks[i]]; return { ...d, blocks };
}
export function addBlock(d: EventPageDesign, kind: BlockKind): EventPageDesign {
  if (!BLOCKS[kind].multiple && d.blocks.some((b) => b.kind === kind)) return d;
  return { ...d, blocks: [...d.blocks, { id: blockId(), kind, ...(kind === "texte" ? { title: "Nouveau bloc", text: "" } : {}) }] };
}
export const removeBlock = (d: EventPageDesign, id: string): EventPageDesign => ({ ...d, blocks: d.blocks.filter((b) => b.id !== id) });
export const patchBlock = (d: EventPageDesign, id: string, p: Partial<PageBlock>): EventPageDesign => ({ ...d, blocks: d.blocks.map((b) => (b.id === id ? { ...b, ...p } : b)) });
export const addable = (d: EventPageDesign) => (Object.keys(BLOCKS) as BlockKind[]).filter((k) => BLOCKS[k].multiple || !d.blocks.some((b) => b.kind === k));

// ── Droits : seule l'administration du trail modifie la page ──
export interface Viewer { id: string; email?: string | null }
/**
 * Administrateur du trail = son créateur (événement de cet appareil ; propriétaire s'il est publié)
 * ou un membre de l'équipe au rôle « Administrateur » connecté avec la même adresse e-mail.
 */
export function canEditEventPage(ev: Pick<EventModel, "origin" | "ownerId" | "team">, viewer?: Viewer | null): boolean {
  if (ev.origin !== "mine") return false;
  if (!viewer || !ev.ownerId || ev.ownerId === viewer.id) return true;
  const mail = viewer.email?.trim().toLowerCase();
  return !!mail && ev.team.some((m) => m.role === "admin" && m.email.trim().toLowerCase() === mail);
}

/** Chiffres clés tirés des courses. */
export function keyFacts(ev: Pick<EventModel, "races" | "date" | "place">) {
  const d = ev.races.map((r) => r.distanceKm).filter((x) => x > 0), g = ev.races.map((r) => r.gainM).filter((x) => x > 0);
  const fmt = (x: number) => String(Math.round(x * 10) / 10).replace(".", ",");
  return {
    courses: ev.races.length,
    distances: d.length ? (Math.min(...d) === Math.max(...d) ? `${fmt(d[0])} km` : `${fmt(Math.min(...d))} à ${fmt(Math.max(...d))} km`) : null,
    gain: g.length ? `${Math.max(...g).toLocaleString("fr-FR")} m D+` : null,
  };
}
/** Jours entiers avant la date de l'événement (négatif : passé). */
export function daysUntil(date: string, now = new Date()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const a = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()), [y, m, d] = date.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - a) / 86400000);
}

// ── Réglages par défaut de l'organisateur : modèle de page réutilisable ──
export interface PageDefaults { design: EventPageDesign; /** appliqués d'office aux nouveaux événements */ autoApply: boolean; savedAt: number }
const DEFAULTS_KEY = "event-page-defaults";
/** Réglages par défaut, mis à jour à chaque enregistrement (composants). */
export function usePageDefaults(): PageDefaults | null { const r = useStore<PageDefaults | null>(DEFAULTS_KEY, null); const design = normalizeDesign(r?.design); return r && design ? { design, autoApply: !!r.autoApply, savedAt: r.savedAt ?? 0 } : null; }
export function loadPageDefaults(): PageDefaults | null {
  const r = readStore<PageDefaults | null>(DEFAULTS_KEY, null); const design = normalizeDesign(r?.design);
  return r && design ? { design, autoApply: !!r.autoApply, savedAt: r.savedAt ?? 0 } : null;
}
export function savePageDefaults(design: EventPageDesign, autoApply: boolean): boolean {
  const d = normalizeDesign(design); if (!d) return false;
  return writeStore(DEFAULTS_KEY, { design: { ...d, updatedAt: undefined }, autoApply, savedAt: Date.now() }).ok;
}
export const clearPageDefaults = () => writeStore(DEFAULTS_KEY, null).ok;
/** Copie du modèle pour un événement : nouveaux identifiants de blocs (aucun lien entre deux pages). */
export function fromDefaults(d: PageDefaults): EventPageDesign {
  return { ...d.design, blocks: d.design.blocks.map((b) => ({ ...b, id: blockId() })), updatedAt: Date.now() };
}
/** Page de départ d'une personnalisation : vos réglages par défaut s'ils existent, sinon ceux du site. */
export const startingDesign = () => { const d = loadPageDefaults(); return d ? fromDefaults(d) : defaultDesign(); };
