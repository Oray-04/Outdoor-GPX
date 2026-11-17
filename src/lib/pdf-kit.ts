"use client";
import type { jsPDF } from "jspdf";
import { POST_ICON, POST_KINDS, type PostKind } from "./events";
import { poiPinSvg } from "./poi-icons";
import { routeMarkerSvg } from "./route-markers";
import { pdfSafe } from "./nutrition/pdf";

/**
 * Mise en page commune des documents de logistique (cartes, fiches bénévoles, temps de passage) :
 * bandeau supérieur au nom de l'événement, pictogrammes du site, tableaux lisibles, pied de page.
 */
export const C = { ink: "#0d1b17", ink2: "#33433d", mute: "#6b7a74", line: "#dfe5e1", zebra: "#f4f6f3", pine: "#12624b", brass: "#cdb07a", brassDark: "#8f6f33", paper: "#fbfaf6", red: "#c0362c", orange: "#d98a0b", green: "#1e7a58" };
export const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
export const T = (s: string) => pdfSafe(s);

export async function newDoc(orientation: "portrait" | "landscape" = "portrait") {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation, unit: "mm", format: "a4", compress: true });
  doc.setFont("helvetica", "normal"); doc.setLineHeightFactor(1.25);
  return doc;
}
export const pageW = (d: jsPDF) => d.internal.pageSize.getWidth();
export const pageH = (d: jsPDF) => d.internal.pageSize.getHeight();
const fill = (d: jsPDF, hex: string) => d.setFillColor(...rgb(hex));
const text = (d: jsPDF, hex: string) => d.setTextColor(...rgb(hex));
const draw = (d: jsPDF, hex: string) => d.setDrawColor(...rgb(hex));

/** Bandeau supérieur : rubrique, nom de l'événement, informations à droite. Renvoie l'ordonnée de départ du contenu. */
export function header(d: jsPDF, o: { kicker: string; title: string; right?: string[] }): number {
  const W = pageW(d), H = 25;
  fill(d, C.ink); d.rect(0, 0, W, H, "F");
  fill(d, C.brass); d.rect(0, H, W, 1.1, "F");
  text(d, C.brass); d.setFont("helvetica", "bold"); d.setFontSize(8); d.setCharSpace(0.6); d.text(T(o.kicker.toUpperCase()), 12, 9); d.setCharSpace(0);
  text(d, "#ffffff"); d.setFontSize(17); const maxW = W - 24 - (o.right?.length ? 85 : 0);
  d.text(d.splitTextToSize(T(o.title), maxW)[0], 12, 18);
  if (o.right?.length) { d.setFont("helvetica", "normal"); d.setFontSize(8.5); text(d, "#d7dfda"); o.right.slice(0, 3).forEach((l, i) => d.text(T(l), W - 12, 9 + i * 5, { align: "right" })); }
  d.setFont("helvetica", "normal"); text(d, C.ink);
  return H + 7;
}
/** Pied de page sur toutes les pages : source et numérotation. */
export function footers(d: jsPDF, left: string) {
  const n = d.getNumberOfPages(), when = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  for (let i = 1; i <= n; i++) {
    // taille propre à chaque page (documents mêlant portrait et paysage)
    const box = (d as unknown as { internal: { getPageInfo: (n: number) => { pageContext: { mediaBox: { topRightX: number; topRightY: number; bottomLeftX: number; bottomLeftY: number } } } } }).internal.getPageInfo(i).pageContext.mediaBox;
    const W = ((box.topRightX - box.bottomLeftX) * 25.4) / 72, H = ((box.topRightY - box.bottomLeftY) * 25.4) / 72;
    d.setPage(i); draw(d, C.line); d.setLineWidth(0.2); d.line(12, H - 9, W - 12, H - 9);
    d.setFontSize(7); text(d, C.mute); d.text(T(left), 12, H - 5); d.text(T(`Édité le ${when} · page ${i}/${n}`), W - 12, H - 5, { align: "right" });
  }
  text(d, C.ink);
}
export function sectionTitle(d: jsPDF, s: string, x: number, y: number) {
  d.setFont("helvetica", "bold"); d.setFontSize(11); text(d, C.ink); d.text(T(s), x, y);
  fill(d, C.brass); d.rect(x, y + 1.6, 12, 0.7, "F"); d.setFont("helvetica", "normal");
  return y + 7;
}
/** Pastille d'état (complet / partiel / à pourvoir). */
export function statusDot(d: jsPDF, x: number, y: number, color: string, r = 1.4) { fill(d, color); draw(d, "#ffffff"); d.setLineWidth(0.3); d.circle(x, y, r, "FD"); }

// ── Pictogrammes : les mêmes dessins que sur les cartes du site, convertis en images ──
const iconCache = new Map<string, { data: string; ratio: number }>();
async function svgToPng(svg: string, scale = 4): Promise<{ data: string; ratio: number }> {
  const wm = /width="([\d.]+)"/.exec(svg), hm = /height="([\d.]+)"/.exec(svg);
  const w = wm ? +wm[1] : 34, h = hm ? +hm[1] : 44;
  const img = new Image(); const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("pictogramme")); img.src = url; });
    const c = document.createElement("canvas"); c.width = Math.round(w * scale); c.height = Math.round(h * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return { data: c.toDataURL("image/png"), ratio: w / h };
  } finally { URL.revokeObjectURL(url); }
}
/** Épingle d'un type de poste (départ et arrivée : drapeaux du parcours). */
export async function pinIcon(kind: PostKind) {
  const k = `pin:${kind}`; if (iconCache.has(k)) return iconCache.get(k)!;
  const ic = POST_ICON[kind], svg = ic === "start" || ic === "finish" ? routeMarkerSvg(ic, 44) : poiPinSvg(ic, 34);
  const v = await svgToPng(svg); iconCache.set(k, v); return v;
}
/** Épingle orientée (degrés, sens horaire) : image carrée dont le centre est la pointe, pour pivoter autour du point exact du poste. */
export async function pinIconRotated(kind: PostKind, deg: number) {
  const k = `pin:${kind}:${Math.round(deg)}`; if (iconCache.has(k)) return iconCache.get(k)!;
  const base = await pinIcon(kind), img = new Image();
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("pictogramme")); img.src = base.data; });
  const H = img.height, W = img.width, S = H * 2, c = document.createElement("canvas"); c.width = S; c.height = S;
  const g = c.getContext("2d")!; g.translate(S / 2, S / 2); g.rotate((deg * Math.PI) / 180); g.drawImage(img, -W / 2, -H, W, H);
  const v = { data: c.toDataURL("image/png"), ratio: 1 }; iconCache.set(k, v); return v;
}
/** Pose une épingle orientée : pointe en (x, y), hauteur h (mm) de l'épingle droite. */
export function placePinRotated(d: jsPDF, icon: { data: string }, x: number, y: number, h: number) { d.addImage(icon.data, "PNG", x - h, y - h, 2 * h, 2 * h, undefined, "FAST"); }
/** Position d'un repère (dx, dy) attaché à l'épingle une fois tournée autour de sa pointe. */
export const rotateAt = (dx: number, dy: number, deg: number) => { const a = (deg * Math.PI) / 180; return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) }; };
/** Pose une épingle dont la pointe est en (x, y), hauteur h (mm). */
export function placePin(d: jsPDF, icon: { data: string; ratio: number }, x: number, y: number, h: number) {
  const w = h * icon.ratio; d.addImage(icon.data, "PNG", x - w / 2, y - h, w, h, undefined, "FAST");
}
export function numBadge(d: jsPDF, n: number, x: number, y: number) {
  const s = String(n), r = s.length > 1 ? 2.1 : 1.8;
  fill(d, C.ink); draw(d, "#ffffff"); d.setLineWidth(0.3); d.circle(x, y, r, "FD");
  d.setFont("helvetica", "bold"); d.setFontSize(s.length > 1 ? 5.6 : 6.4); text(d, "#ffffff"); d.text(s, x, y + 0.75, { align: "center" }); d.setFont("helvetica", "normal"); text(d, C.ink);
}

/** Tableau : en-tête coloré répété à chaque page, lignes alternées, retour à la ligne dans les cellules. */
export interface Col { h: string; w: number; align?: "left" | "right" | "center" }
export interface Cell { t: string; color?: string; bold?: boolean; icon?: { data: string; ratio: number }; dot?: string }
export function table(d: jsPDF, cols: Col[], rows: Cell[][], x: number, y0: number, opts: { top?: number; bottom?: number; fontSize?: number; onNewPage?: () => number } = {}): number {
  const fs = opts.fontSize ?? 8, lh = fs * 0.42, padY = 1.8, bottom = pageH(d) - (opts.bottom ?? 14);
  const totalW = cols.reduce((s, c) => s + c.w, 0);
  const head = (y: number) => {
    fill(d, C.pine); d.rect(x, y, totalW, 7, "F"); d.setFont("helvetica", "bold"); d.setFontSize(fs); text(d, "#ffffff");
    let cx = x; for (const c of cols) { const tx = c.align === "right" ? cx + c.w - 2 : c.align === "center" ? cx + c.w / 2 : cx + 2; d.text(T(c.h), tx, y + 4.7, { align: c.align ?? "left" }); cx += c.w; }
    d.setFont("helvetica", "normal"); text(d, C.ink); return y + 7;
  };
  let y = head(y0);
  rows.forEach((r, ri) => {
    d.setFontSize(fs);
    const lines = r.map((cell, ci) => d.splitTextToSize(T(cell.t || ""), cols[ci].w - 4 - (cell.icon ? 5 : 0) - (cell.dot ? 3.5 : 0)) as string[]);
    const h = Math.max(6.2, Math.max(...lines.map((l) => l.length)) * lh + padY * 2);
    if (y + h > bottom) { d.addPage(); y = head(opts.onNewPage ? opts.onNewPage() : opts.top ?? 14); }
    if (ri % 2) { fill(d, C.zebra); d.rect(x, y, totalW, h, "F"); }
    let cx = x;
    r.forEach((cell, ci) => {
      const c = cols[ci]; let tx = c.align === "right" ? cx + c.w - 2 : c.align === "center" ? cx + c.w / 2 : cx + 2;
      if (cell.icon) { placePin(d, cell.icon, cx + 3.6, y + Math.min(h, 7) - 0.8, 5.4); tx += 5; }
      if (cell.dot) { statusDot(d, tx + 1.2, y + padY + lh * 0.55, cell.dot, 1.2); tx += 3.5; }
      d.setFont("helvetica", cell.bold ? "bold" : "normal"); text(d, cell.color ?? C.ink);
      d.text(lines[ci], tx, y + padY + lh * 0.85, { align: c.align ?? "left" });
      cx += c.w;
    });
    draw(d, C.line); d.setLineWidth(0.15); d.line(x, y + h, x + totalW, y + h);
    y += h;
  });
  d.setFont("helvetica", "normal"); text(d, C.ink);
  return y;
}
export const kindLabel = (k: PostKind) => POST_KINDS[k].label;
