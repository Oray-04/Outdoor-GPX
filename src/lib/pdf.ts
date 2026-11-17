/** Documents hors logistique (analyse, préparation). Les documents de logistique sont dans `logistics-pdf.ts`. */

import type { Analysis } from "./analysis";
import { GROUP_LABEL } from "./analysis";
const km1 = (m: number) => (m / 1000).toFixed(1).replace(".", ",");

/** Récapitulatif imprimable de l'analyse cadastrale et réglementaire d'un tracé. */
export async function analysisPdf(title: string, a: Analysis): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = 16; const W = 180;
  const room = (h: number) => { if (y + h > 282) { doc.addPage(); y = 16; } };
  const h1 = (t: string) => { room(12); doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text(t, 15, y); y += 6; doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); };
  const para = (t: string) => { const l = doc.splitTextToSize(t, W); room(l.length * 4.6 + 2); doc.text(l, 15, y); y += l.length * 4.6 + 2; };

  doc.setFontSize(17); doc.setFont("helvetica", "bold"); doc.text("Analyse cadastrale et réglementaire", 15, y); y += 8;
  doc.setFontSize(11); doc.setFont("helvetica", "normal"); doc.text(title, 15, y); y += 5;
  doc.setFontSize(9); doc.setTextColor(110); doc.text(`Tracé de ${km1(a.routeM)} km · établi le ${new Date(a.at).toLocaleDateString("fr-FR")} · sources : IGN (cadastre, BD TOPO), OpenStreetMap`, 15, y); doc.setTextColor(0); y += 7;

  doc.setFillColor(253, 230, 219); doc.rect(15, y - 4, W, 22, "F"); doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.text("À lire avant tout", 17, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text(doc.splitTextToSize("Ce document est une aide à la préparation. Il ne valide en aucun cas un droit de passage ni une autorisation. Les données publiques peuvent être incomplètes ou datées. Le cadastre ne donne pas l'identité des propriétaires : pour l'obtenir, adressez-vous au service de la publicité foncière ou à la mairie en indiquant les références ci-dessous.", W - 4), 17, y + 4.5); y += 25;
  doc.setFontSize(9.5);

  h1("Chemins empruntés (BD TOPO, IGN)");
  const s = a.summary;
  para(`Privé selon la source : ${s.priveKm.toFixed(1).replace(".", ",")} km · non signalé privé : ${s.nonPriveKm.toFixed(1).replace(".", ",")} km · statut inconnu ou hors réseau recensé, à vérifier : ${s.inconnuKm.toFixed(1).replace(".", ",")} km.`);
  para("Par nature : " + (s.byNature.map((n) => `${n.nature} ${n.km.toFixed(1).replace(".", ",")} km`).join(" · ") || "—"));
  para(s.itineraires.length ? "Itinéraires de randonnée balisés rencontrés : " + s.itineraires.map((i) => `${i.name}${i.gr ? " (GR)" : ""} ${i.km.toFixed(1).replace(".", ",")} km`).join(" · ") : "Aucun itinéraire de randonnée balisé rencontré dans les données IGN.");
  if (a.waymarked.length) para("Itinéraires de longue distance recensés dans l'emprise (OpenStreetMap, à vérifier) : " + a.waymarked.map((r) => `${r.ref || r.name}${r.group ? ` (${GROUP_LABEL[r.group] ?? r.group})` : ""}`).join(" · "));

  h1("Zones à réglementation particulière");
  if (a.zones.length) a.zones.forEach((z) => para(`${z.kind === "foret" ? "Forêt publique" : "Parc / réserve / site protégé"} : ${z.name}${z.nature ? ` (${z.nature})` : ""} — ${(z.lengthM / 1000).toFixed(2).replace(".", ",")} km. Autorisation ou consultation du gestionnaire à prévoir.`)); else para("Aucune forêt publique ni zone protégée recensée sur le tracé.");

  h1(`Parcelles cadastrales traversées (${a.parcels.length})`);
  const cols = [15, 62, 86, 104, 148]; doc.setFont("helvetica", "bold"); ["Commune", "Référence", "Section", "Numéro", "Longueur"].forEach((t, i) => doc.text(t, cols[i], y)); doc.setFont("helvetica", "normal"); y += 4;
  for (const p of a.parcels) {
    if (y > 280) { doc.addPage(); y = 16; doc.setFont("helvetica", "bold"); ["Commune", "Référence", "Section", "Numéro", "Longueur"].forEach((t, i) => doc.text(t, cols[i], y)); doc.setFont("helvetica", "normal"); y += 4; }
    doc.text(p.commune.slice(0, 26), cols[0], y); doc.text(p.ref, cols[1], y); doc.text(p.section, cols[2], y); doc.text(p.numero, cols[3], y); doc.text(`${Math.round(p.lengthM)} m`, cols[4], y); y += 4.2;
  }
  doc.setFontSize(8); doc.setTextColor(110); doc.text("Crête — document indicatif. Fonds et données : © IGN – Géoplateforme, © contributeurs OpenStreetMap.", 15, 291);
  return doc.output("blob");
}

/** Dossier de préparation d'une épreuve : sections de texte générées par `prepReport`. */
export async function prepPdf(title: string, subtitle: string, notice: string, sections: { title: string; lines: string[] }[]): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = 16; const W = 180;
  const room = (h: number) => { if (y + h > 284) { doc.addPage(); y = 16; } };
  doc.setFontSize(17); doc.setFont("helvetica", "bold"); doc.text("Dossier de préparation", 15, y); y += 8;
  doc.setFontSize(12); doc.text(doc.splitTextToSize(title, W), 15, y); y += 6;
  doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(110); doc.text(subtitle, 15, y); doc.setTextColor(0); y += 7;
  const nl = doc.splitTextToSize(notice, W - 4); doc.setFillColor(253, 230, 219); doc.rect(15, y - 4, W, nl.length * 4.3 + 4, "F"); doc.text(nl, 17, y); y += nl.length * 4.3 + 6;
  for (const s of sections) {
    room(14); doc.setFont("helvetica", "bold"); doc.setFontSize(11.5); doc.text(doc.splitTextToSize(s.title, W), 15, y); y += 6; doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
    for (const t of s.lines) { const l = doc.splitTextToSize(`• ${t}`, W); room(l.length * 4.5 + 1.5); doc.text(l, 15, y); y += l.length * 4.5 + 1.5; }
    y += 3;
  }
  return doc.output("blob");
}
