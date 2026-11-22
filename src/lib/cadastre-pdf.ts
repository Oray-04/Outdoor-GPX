"use client";
import type { jsPDF } from "jspdf";
import { C, rgb, T, newDoc, pageW, pageH, header, footers, sectionTitle, table, statusDot, type Col, type Cell } from "./pdf-kit";
import { ZONE_KINDS, ZONE_STATUS, GROUP_LABEL, type ZoneStatus } from "./analysis";
import { communesOf, crossedParcels, touchedParcels, zoneStatus, type StoredAnalysis, type StoredZone, type Synthesis } from "./cadastre";

/**
 * Documents de l'analyse cadastrale et réglementaire : fiche détaillée par parcours et synthèse de l'événement
 * (parcelles uniques, communes, zonages, puis le détail de chaque parcours en annexe).
 */
const km = (m: number, d = 2) => (m / 1000).toFixed(d).replace(".", ",");
const dateFr = (t: number) => new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const SOURCES = "Sources : IGN – cadastre Parcellaire Express (API Carto / Géoplateforme), BD TOPO ; INPN / PatriNat (OFB, MNHN). Licence Ouverte Etalab 2.0.";
const NOTICE = "Aide à la préparation, pas une validation. Ce document ne confirme aucun droit de passage ni autorisation, et ne donne pas l'identité des propriétaires (à demander au service de la publicité foncière ou en mairie avec les références ci-dessous). Un zonage environnemental n'est pas une interdiction de passage : seuls les textes officiels (décret, arrêté, charte) font foi. Distances calculées sur le tracé GPS : précision liée à celle du tracé et des limites cadastrales (quelques mètres).";
const BOTTOM = 14;
const FOOT = "Sources : IGN (cadastre, BD TOPO), INPN – Licence Ouverte Etalab 2.0";

function notice(d: jsPDF, y: number, text = NOTICE): number {
  const W = pageW(d) - 24; d.setFontSize(8); const lines = d.splitTextToSize(T(text), W - 8) as string[]; const h = lines.length * 3.5 + 5;
  d.setFillColor(...rgb("#fbefe6")); d.setDrawColor(...rgb("#e7b48f")); d.setLineWidth(0.25); d.roundedRect(12, y, W, h, 1.5, 1.5, "FD");
  d.setTextColor(...rgb(C.ink2)); d.text(lines, 16, y + 4.6); d.setTextColor(...rgb(C.ink));
  return y + h + 5;
}
function tiles(d: jsPDF, y: number, items: [string, string][]): number {
  const W = pageW(d) - 24, n = items.length, gap = 2.5, w = (W - gap * (n - 1)) / n;
  items.forEach(([label, value], i) => {
    const x = 12 + i * (w + gap); d.setFillColor(...rgb(C.zebra)); d.roundedRect(x, y, w, 15, 1.5, 1.5, "F");
    d.setFont("helvetica", "bold"); d.setFontSize(12.5); d.setTextColor(...rgb(C.ink)); d.text(T(value), x + 3, y + 7);
    d.setFont("helvetica", "normal"); d.setFontSize(7); d.setTextColor(...rgb(C.mute)); d.text(d.splitTextToSize(T(label), w - 5)[0], x + 3, y + 12); d.setTextColor(...rgb(C.ink));
  });
  return y + 21;
}
/** Place pour un titre + quelques lignes, sinon nouvelle page. */
function room(d: jsPDF, y: number, need: number): number { if (y + need > pageH(d) - BOTTOM) { d.addPage("a4", "portrait"); return 14; } return y; }
function statusLegend(d: jsPDF, y: number): number {
  d.setFontSize(7.5); let x = 12;
  for (const s of ["reglementaire", "procedure", "vigilance"] as ZoneStatus[]) { statusDot(d, x + 1.3, y - 1, ZONE_STATUS[s].color, 1.2); d.setTextColor(...rgb(C.ink2)); const t = T(ZONE_STATUS[s].label); d.text(t, x + 3.6, y); x += d.getTextWidth(t) + 9; }
  d.setTextColor(...rgb(C.ink)); return y + 5;
}
const zoneTag = (z: StoredZone) => `${ZONE_STATUS[zoneStatus(z)].short} · ${ZONE_KINDS[z.kind]?.label ?? z.nature}`;

function zonesTable(d: jsPDF, y: number, zones: (StoredZone & { byRoute?: { label: string; lengthM: number }[] })[], withRoutes: boolean): number {
  y = room(d, y, 30); y = sectionTitle(d, `Zonages environnementaux et réglementaires (${zones.length})`, 12, y + 2); y = statusLegend(d, y);
  if (!zones.length) { d.setFontSize(9); d.text(T("Aucun espace protégé, site Natura 2000, ZNIEFF ni forêt publique recensé sur le tracé (sources consultées : INPN, BD TOPO)."), 12, y + 2); return y + 9; }
  const cols: Col[] = withRoutes ? [{ h: "Type", w: 46 }, { h: "Nom", w: 46 }, { h: "Parcours (km)", w: 44 }, { h: "Ce que cela implique", w: 50 }] : [{ h: "Type", w: 48 }, { h: "Nom", w: 50 }, { h: "Km", w: 14, align: "right" }, { h: "Ce que cela implique", w: 74 }];
  const rows: Cell[][] = zones.map((z) => {
    const st = zoneStatus(z), k = ZONE_KINDS[z.kind];
    const name: Cell = { t: `${z.name}${z.manager ? `\nGestion : ${z.manager}` : ""}${z.url ? `\n${z.url}` : ""}`, bold: false };
    return withRoutes
      ? [{ t: k?.label ?? z.nature, dot: ZONE_STATUS[st].color, bold: true }, name, { t: (z.byRoute ?? []).map((b) => `${b.label} : ${km(b.lengthM)}`).join("\n") }, { t: k?.note ?? "" }]
      : [{ t: k?.label ?? z.nature, dot: ZONE_STATUS[st].color, bold: true }, name, { t: km(z.lengthM) }, { t: k?.note ?? "" }];
  });
  return table(d, cols, rows, 12, y, { fontSize: 7.4, bottom: BOTTOM }) + 6;
}

/** Détail d'un parcours, à partir de la page courante (nouvelle page si `newPage`). */
function routeSection(d: jsPDF, evName: string, label: string, a: StoredAnalysis, o: { kicker: string; newPage: boolean }) {
  if (o.newPage) d.addPage("a4", "portrait");
  let y = header(d, { kicker: o.kicker, title: evName, right: [label, `${km(a.routeM, 1)} km · analysé le ${dateFr(a.at)}`, a.routeName] });
  if (!o.newPage) y = notice(d, y);
  const crossed = crossedParcels(a), touched = touchedParcels(a), comm = communesOf(a), onP = crossed.reduce((t, p) => t + p.lengthM, 0);
  y = tiles(d, y, [["Distance", `${km(a.routeM, 1)} km`], ["Parcelles", String(crossed.length)], ["Communes", String(comm.length)], ["Sur parcelles", `${km(onP, 1)} km`], ["Hors parcelles", `${km(a.nonCadastralM, 1)} km`], ["Zonages", String(a.zones.length)]]);
  d.setFontSize(7.5); d.setTextColor(...rgb(C.mute)); d.text(T("Hors parcelles : domaine public non cadastré (routes, rues, cours d'eau…) ou limite imprécise du tracé."), 12, y - 3); d.setTextColor(...rgb(C.ink)); y += 2;
  for (const w of a.warnings) { y = room(d, y, 8); d.setFontSize(8); d.setTextColor(...rgb(C.brassDark)); const l = d.splitTextToSize(T(`À noter : ${w}`), pageW(d) - 24); d.text(l, 12, y); y += l.length * 3.6 + 1.5; d.setTextColor(...rgb(C.ink)); }
  y = zonesTable(d, y + 1, a.zones, false);
  y = room(d, y, 30); y = sectionTitle(d, `Communes traversées (${comm.length})`, 12, y + 2);
  y = table(d, [{ h: "Commune", w: 80 }, { h: "Code INSEE", w: 30 }, { h: "Parcelles", w: 34, align: "right" }, { h: "Distance (km)", w: 42, align: "right" }], comm.map((c) => [{ t: c.name, bold: true }, { t: c.insee }, { t: String(c.parcels) }, { t: km(c.lengthM, 3) }]), 12, y, { fontSize: 8, bottom: BOTTOM }) + 6;
  y = room(d, y, 30); y = sectionTitle(d, `Parcelles traversées, dans l'ordre du parcours (${crossed.length})`, 12, y + 2);
  y = table(d, [{ h: "N°", w: 9, align: "right" }, { h: "Commune", w: 46 }, { h: "Référence cadastrale", w: 42 }, { h: "Surface (m²)", w: 23, align: "right" }, { h: "Entrée (km du parcours)", w: 36, align: "right" }, { h: "Km sur la parcelle", w: 30, align: "right" }],
    crossed.map((p, i) => [{ t: String(i + 1), color: C.mute }, { t: p.commune + (p.comAbs ? ` (anc. ${p.comAbs})` : "") }, { t: `${p.ref}${(p.passages ?? 1) > 1 ? `\n${p.passages} passages` : ""}`, bold: true }, { t: p.areaM2 ? p.areaM2.toLocaleString("fr-FR") : "—" }, { t: p.fromM != null ? km(p.fromM) : "—" }, { t: km(p.lengthM, 3) }]), 12, y, { fontSize: 7.2, bottom: BOTTOM }) + 4;
  d.setFontSize(7.5); d.setTextColor(...rgb(C.mute)); y = room(d, y, 10);
  d.text(T(`Total sur parcelles : ${km(onP, 3)} km ; hors parcelles : ${km(a.nonCadastralM, 3)} km ; somme : ${km(onP + a.nonCadastralM, 3)} km = longueur du parcours.`), 12, y); y += 5; d.setTextColor(...rgb(C.ink));
  if (touched.length) {
    y = room(d, y, 16); d.setFontSize(8.5); d.setFont("helvetica", "bold"); d.text(T(`Parcelles en limite du tracé (contact sans traversée) : ${touched.length}`), 12, y); d.setFont("helvetica", "normal"); y += 4;
    const l = d.splitTextToSize(T(touched.map((p) => `${p.commune} ${p.ref}`).join(" · ")), pageW(d) - 24); d.setFontSize(7.5); for (const line of l) { y = room(d, y, 4); d.text(line, 12, y); y += 3.5; } y += 3;
  }
  const s = a.summary; y = room(d, y, 24); y = sectionTitle(d, "Chemins empruntés (BD TOPO)", 12, y + 2); d.setFontSize(8.5);
  const lines = [`Privé selon la source : ${km(s.priveKm * 1000, 1)} km · non signalé privé : ${km(s.nonPriveKm * 1000, 1)} km · statut inconnu ou hors réseau recensé : ${km(s.inconnuKm * 1000, 1)} km. « Non signalé privé » ne veut pas dire « public ».`,
    `Par nature : ${s.byNature.map((n) => `${n.nature} ${km(n.km * 1000, 1)} km`).join(" · ") || "—"}`,
    s.itineraires.length ? `Itinéraires balisés : ${s.itineraires.map((i) => `${i.name}${i.gr ? " (GR)" : ""} ${km(i.km * 1000, 1)} km`).join(" · ")}` : "Aucun itinéraire de randonnée balisé dans les données IGN.",
    ...(a.waymarked.length ? [`Dans l'emprise (OpenStreetMap, à vérifier) : ${a.waymarked.map((r) => `${r.ref || r.name}${r.group ? ` (${GROUP_LABEL[r.group] ?? r.group})` : ""}`).join(" · ")}`] : [])];
  for (const t of lines) { const l = d.splitTextToSize(T(t), pageW(d) - 24); y = room(d, y, l.length * 3.9); d.text(l, 12, y); y += l.length * 3.9 + 1.5; }
}

export async function routeCadastrePdf(evName: string, label: string, a: StoredAnalysis): Promise<Blob> {
  const d = await newDoc("portrait");
  routeSection(d, evName, label, a, { kicker: "Analyse cadastrale et réglementaire", newPage: false });
  footers(d, `${evName} · ${label} · ${FOOT}`);
  return d.output("blob");
}

export async function synthesisPdf(evName: string, s: Synthesis, o: { annexes?: boolean } = {}): Promise<Blob> {
  const d = await newDoc("portrait");
  let y = header(d, { kicker: "Synthèse cadastrale et réglementaire", title: evName, right: [`${s.routes.length} parcours analysé(s)`, `Édition du ${dateFr(Date.now())}`] });
  y = notice(d, y);
  y = tiles(d, y, [["Parcours analysés", String(s.routes.length)], ["Parcelles uniques", String(s.totals.parcels)], ["Parcelles communes", String(s.totals.shared)], ["Communes", String(s.totals.communes)], ["Cumul sur parcelles", `${km(s.totals.cumulM, 1)} km`]]);
  if (s.missing.length) { d.setFontSize(8.5); d.setTextColor(...rgb(C.red)); const l = d.splitTextToSize(T(`Non analysé(s), absent(s) de cette synthèse : ${s.missing.map((m) => m.label).join(", ")}.`), pageW(d) - 24); d.text(l, 12, y); y += l.length * 4 + 3; d.setTextColor(...rgb(C.ink)); }
  y = sectionTitle(d, "Parcours", 12, y + 2);
  y = table(d, [{ h: "Parcours", w: 46 }, { h: "Distance (km)", w: 24, align: "right" }, { h: "Parcelles", w: 20, align: "right" }, { h: "Communes", w: 20, align: "right" }, { h: "Hors parc. (km)", w: 28, align: "right" }, { h: "Zonages", w: 18, align: "right" }, { h: "Analysé le", w: 30 }],
    s.routes.map((r) => [{ t: `${r.label}\n${r.a.routeName}`, bold: true }, { t: km(r.a.routeM) }, { t: String(crossedParcels(r.a).length) }, { t: String(communesOf(r.a).length) }, { t: km(r.a.nonCadastralM) }, { t: String(r.a.zones.length) }, { t: new Date(r.a.at).toLocaleDateString("fr-FR") }]), 12, y, { fontSize: 8, bottom: BOTTOM }) + 6;
  y = room(d, y, 30); y = sectionTitle(d, `Communes concernées (${s.communes.length})`, 12, y + 2);
  y = table(d, [{ h: "Commune", w: 50 }, { h: "Code INSEE", w: 22 }, { h: "Parcelles", w: 20, align: "right" }, { h: "dont communes", w: 24, align: "right" }, { h: "Cumul (km)", w: 30, align: "right" }, { h: "Parcours", w: 40 }],
    s.communes.map((c) => [{ t: c.name, bold: true }, { t: c.insee }, { t: String(c.parcels) }, { t: String(c.sharedParcels) }, { t: km(c.totalM, 3) }, { t: c.routes.join(", ") }]), 12, y, { fontSize: 8, bottom: BOTTOM }) + 6;
  y = zonesTable(d, y, s.zones, true);
  y = room(d, y, 30); y = sectionTitle(d, `Parcelles traversées — chacune une seule fois (${s.parcels.length})`, 12, y + 2);
  d.setFontSize(7.5); d.setTextColor(...rgb(C.mute)); d.text(T("En gras : parcelle commune à plusieurs parcours. Entrée = kilomètre du parcours où l'on entre sur la parcelle. Cumul = somme des distances de chaque parcours."), 12, y); d.setTextColor(...rgb(C.ink)); y += 4;
  table(d, [{ h: "Commune", w: 34 }, { h: "Référence cadastrale", w: 34 }, { h: "Surface (m²)", w: 18, align: "right" }, { h: "Parcours", w: 32 }, { h: "Entrée (km)", w: 24, align: "right" }, { h: "Distance (km)", w: 24, align: "right" }, { h: "Cumul (km)", w: 20, align: "right" }],
    s.parcels.map((p) => { const sh = p.byRoute.length > 1, col = sh ? C.pine : C.ink; return [{ t: p.commune + (p.comAbs ? ` (anc. ${p.comAbs})` : ""), bold: sh }, { t: p.ref, bold: sh }, { t: p.areaM2 ? p.areaM2.toLocaleString("fr-FR") : "—" },
      { t: p.byRoute.map((b) => b.label).join("\n"), bold: sh, color: col }, { t: p.byRoute.map((b) => (b.fromM != null ? km(b.fromM) : "—")).join("\n"), color: col }, { t: p.byRoute.map((b) => km(b.lengthM, 3)).join("\n"), color: col }, { t: km(p.totalM, 3), bold: sh }]; }), 12, y, { fontSize: 7.2, bottom: BOTTOM });
  if (o.annexes !== false) for (const r of s.routes) routeSection(d, evName, r.label, r.a, { kicker: `Annexe — détail du parcours`, newPage: true });
  footers(d, `${evName} · ${FOOT}`);
  return d.output("blob");
}
export { zoneTag };
