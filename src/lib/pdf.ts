import type { EventModel, Race, PassageRow, Post, Volunteer } from "./events";
import { POST_KINDS } from "./events";

const fmtElapsed = (m: number) => `${Math.floor(m / 60)}h${String(Math.round(m % 60)).padStart(2, "0")}`;

export async function passagePdf(ev: EventModel, race: Race, rows: PassageRow[], labels: string[], finishHours: number[]): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setFontSize(16); doc.text(`${ev.name} — ${race.label}`, 12, 15);
  doc.setFontSize(10); doc.text(`${ev.date} · départ ${race.startTime} · ${race.distanceKm} km · ${race.gainM} m D+`, 12, 22);
  doc.text(`Scénarios (durée totale) : ${labels.map((l, i) => `${l} ${fmtElapsed(finishHours[i] * 60)}`).join(" · ")}`, 12, 28);
  const cols = [12, 28, 90, 120, ...labels.map((_, i) => 150 + i * 42)];
  let y = 38;
  const head = () => { doc.setFont("helvetica", "bold"); ["Km", "Poste", "Type", "Barrière", ...labels].forEach((h, i) => doc.text(h, cols[i], y)); doc.setFont("helvetica", "normal"); y += 2; doc.line(12, y, 285, y); y += 5; };
  head();
  for (const r of rows) {
    if (y > 195) { doc.addPage(); y = 15; head(); }
    doc.text(r.km.toFixed(1), cols[0], y); doc.text(r.post.name.slice(0, 40), cols[1], y); doc.text(POST_KINDS[r.post.kind].label, cols[2], y);
    doc.text(r.post.cutoffH != null ? `${fmtElapsed(r.post.cutoffH * 60)}` : "-", cols[3], y);
    r.times.forEach((t, i) => { if (r.late[i]) doc.setTextColor(200, 55, 45); doc.text(`${t.clock} (${fmtElapsed(t.elapsedMin)})`, cols[4 + i], y); doc.setTextColor(0); });
    y += 6;
  }
  doc.setFontSize(8); doc.setTextColor(120); doc.text("Temps estimés au prorata de l'effort (km + D+/100). En rouge : passage après la barrière horaire. Document indicatif.", 12, 202);
  return doc.output("blob");
}

export async function volunteersPdf(ev: EventModel, vols: Volunteer[], posts: Post[]): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  vols.forEach((v, i) => {
    if (i) doc.addPage();
    const p = posts.find((x) => x.id === v.postId);
    doc.setFontSize(20); doc.text("Fiche bénévole", 15, 22);
    doc.setFontSize(12); doc.text(ev.name, 15, 32); doc.text(`${ev.date} · ${ev.place}`, 15, 39);
    doc.setFontSize(14); doc.text(v.name, 15, 55);
    doc.setFontSize(11);
    const lines = [`Téléphone : ${v.phone || "—"}`, `Poste : ${p ? `${p.name} (${POST_KINDS[p.kind].label}, km ${p.km.toFixed(1)})` : "non affecté"}`, `Horaires : ${v.from || "?"} - ${v.to || "?"}`];
    lines.forEach((l, k) => doc.text(l, 15, 65 + k * 8));
    doc.setFontSize(12); doc.text("Consignes", 15, 100); doc.setFontSize(11);
    doc.text(doc.splitTextToSize(v.instructions || p?.note || "Aucune consigne particulière.", 180), 15, 108);
  });
  return doc.output("blob");
}

export interface MapPin { n: number; x: number; y: number; color: string; label: string }
export async function mapPdf(ev: EventModel, race: Race, image: string, imgW: number, imgH: number, pins: MapPin[]): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setFontSize(15); doc.text(`${ev.name} — ${race.label} : carte logistique`, 10, 12);
  const maxW = 190, maxH = 185; const k = Math.min(maxW / imgW, maxH / imgH); const w = imgW * k, h = imgH * k;
  doc.addImage(image, "PNG", 10, 17, w, h);
  doc.setFontSize(8);
  for (const p of pins) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(p.color.slice(i, i + 2), 16));
    doc.setFillColor(r, g, b); doc.setDrawColor(255); doc.circle(10 + p.x * k, 17 + p.y * k, 2.4, "FD");
    doc.setTextColor(255); doc.text(String(p.n), 10 + p.x * k, 17 + p.y * k + 1, { align: "center" }); doc.setTextColor(0);
  }
  doc.setFontSize(9); let y = 20;
  pins.forEach((p) => { if (y > 200) return; doc.text(`${p.n}. ${p.label}`, 205, y); y += 5; });
  doc.setFontSize(7); doc.setTextColor(120); doc.text("Fond : © IGN – Géoplateforme / © contributeurs OpenStreetMap", 10, 205);
  return doc.output("blob");
}

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
