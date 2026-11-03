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
