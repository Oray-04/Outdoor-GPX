"use client";
import type { StyleSpecification } from "maplibre-gl";
import { POST_KINDS, POST_STATUS, postNumbers, postRaceIds, postStatus, postsOfRace, staffing, volunteersAt, type EventModel, type PassageRow, type Post, type PostKind, type Race, type Volunteer } from "./events";
import type { Pt } from "./types";
import { snapshotMap } from "./map-snapshot";
import { C, T, footers, header, newDoc, numBadge, pageH, pageW, pinIcon, placePin, rgb, sectionTitle, statusDot, table, type Cell } from "./pdf-kit";

/**
 * Documents de terrain de la logistique, tous sur la même mise en page (bandeau, pictogrammes du site, légende, tableaux) :
 * carte logistique par course, tableau d'affectation et fiches bénévoles, temps de passage.
 */
const SOURCE = "Fond de carte : © IGN – Géoplateforme · © contributeurs OpenStreetMap · Crête";
const dateFr = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "Date à préciser");
const kmFr = (k: number) => k.toFixed(1).replace(".", ",");
const hh = (h: number) => `${Math.floor(h)}h${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
const raceLine = (r: Race) => `${kmFr(r.distanceKm)} km · ${r.gainM} m D+ · départ ${r.startTime}`;
const raceLabels = (ev: EventModel, p: Post) => postRaceIds(p).map((id) => ev.races.find((r) => r.id === id)?.label ?? "?");
const kmOn = (p: Post, raceId: string) => (p.raceId === raceId ? p.km : p.shared?.find((s) => s.raceId === raceId)?.km ?? p.km);
const ROUTE_COLOR = "#f0612b";

export interface RouteGeo { id: string; name: string; coords: Pt[] }
export type Progress = (msg: string) => void;

// ── Carte logistique : une page par course (carte cadrée + légende), puis le tableau de ses postes ──
export async function logisticsMapsPdf(ev: EventModel, races: Race[], routes: RouteGeo[], opts: { style?: StyleSpecification; progress?: Progress } = {}): Promise<Blob> {
  const d = await newDoc("landscape");
  const nums = postNumbers(ev);
  let first = true;
  for (const race of races) {
    const rt = routes.find((r) => r.id === race.routeId); const posts = postsOfRace(ev.posts, race.id).sort((a, b) => a.km - b.km);
    // orientation de la page selon la forme du parcours (projection de la carte) : la carte occupe le maximum de place
    const pts = posts.filter((p) => p.lng != null && p.lat != null).map((p) => [p.lng!, p.lat!] as [number, number]);
    const line = rt ? rt.coords.map((c) => [c[0], c[1]] as [number, number]) : [];
    const all = [...line, ...pts], my = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
    const aspect = all.length > 1 ? ((Math.max(...all.map((c) => c[0])) - Math.min(...all.map((c) => c[0]))) * Math.PI / 180 || 1e-4) / ((my(Math.max(...all.map((c) => c[1]))) - my(Math.min(...all.map((c) => c[1])))) || 1e-4) : 1.4;
    const portrait = aspect < 0.95, orient = portrait ? "portrait" : "landscape";
    if (first) { if (portrait) { d.deletePage(1); d.addPage("a4", "portrait"); } } else d.addPage("a4", orient);
    first = false;
    const W = pageW(d), Hp = pageH(d);
    opts.progress?.(`Carte de « ${race.label} »…`);
    const y0 = header(d, { kicker: "Carte logistique", title: ev.name, right: [race.label, raceLine(race), `${dateFr(ev.date)}${ev.place ? ` · ${ev.place}` : ""}`] });
    // paysage : carte 202 × 163 mm, légende à droite ; portrait : carte 186 × 196 mm, légende dessous
    const MX = 12, MY = y0, MW = portrait ? W - 24 : 202, MH = portrait ? Math.min(190, Hp - y0 - 72) : Hp - y0 - 15, PXW = 1240, PXH = Math.round(PXW * (MH / MW)), k = MW / PXW;
    d.setFillColor(...rgb(C.zebra)); d.rect(MX, MY, MW, MH, "F");
    if (line.length > 1 || pts.length) {
      try {
        const snap = await snapshotMap({ width: PXW, height: PXH, lines: line.length > 1 ? [{ coords: line, color: ROUTE_COLOR, width: 4.5 }] : [], fit: all, points: pts, padding: { top: 82, right: 50, bottom: 36, left: 50 }, maxZoom: 16, style: opts.style });
        d.addImage(snap.dataUrl, "JPEG", MX, MY, MW, MH, undefined, "FAST");
        const withPos = posts.filter((p) => p.lng != null && p.lat != null);
        for (let i = 0; i < withPos.length; i++) {
          const p = withPos[i], q = snap.points[i], x = MX + q.x * k, y = MY + q.y * k;
          placePin(d, await pinIcon(p.kind), x, y, p.kind === "depart" || p.kind === "arrivee" ? 9 : 7.6);
          numBadge(d, nums.get(p.id)?.n ?? i + 1, x - 3.4, y - 7.4);
          if (p.staffNeeded > 0) statusDot(d, x + 3.4, y - 7.4, POST_STATUS[postStatus(ev, p)].color, 1.25);
        }
      } catch { d.setFontSize(10); d.setTextColor(...rgb(C.mute)); d.text(T("Carte indisponible (fond de carte non chargé). Le tableau des postes reste valable."), MX + 6, MY + 12); d.setTextColor(...rgb(C.ink)); }
    } else { d.setFontSize(10); d.text(T("Aucun parcours lié à cette course."), MX + 6, MY + 12); }
    d.setDrawColor(...rgb(C.line)); d.setLineWidth(0.3); d.rect(MX, MY, MW, MH, "S");
    // nord
    const nx = MX + MW - 8, ny = MY + 9; d.setFillColor(255, 255, 255); d.circle(nx, ny, 4.4, "F"); d.setFillColor(...rgb(C.red)); d.triangle(nx, ny - 3.3, nx - 1.6, ny + 0.6, nx + 1.6, ny + 0.6, "F"); d.setFontSize(6.5); d.setFont("helvetica", "bold"); d.text("N", nx, ny + 3.3, { align: "center" }); d.setFont("helvetica", "normal");
    // légende latérale
    const LX = portrait ? MX : MX + MW + 7, LW = portrait ? 86 : W - LX - 12; let ly = sectionTitle(d, "Légende", LX, portrait ? MY + MH + 9 : MY + 4);
    d.setDrawColor(...rgb(ROUTE_COLOR)); d.setLineWidth(1.3); d.line(LX + 1, ly - 1, LX + 8, ly - 1); d.setLineWidth(0.2);
    d.setFontSize(8.5); d.text(T(`Tracé — ${race.label}`), LX + 11, ly); ly += 7;
    const kinds = (Object.keys(POST_KINDS) as PostKind[]).filter((kk) => posts.some((p) => p.kind === kk));
    for (const kk of kinds) {
      placePin(d, await pinIcon(kk), LX + 4.5, ly + 1.2, 6.2);
      d.setFontSize(8.5); d.text(T(POST_KINDS[kk].label), LX + 11, ly - 1); d.setTextColor(...rgb(C.mute)); d.setFontSize(7.5); d.text(String(posts.filter((p) => p.kind === kk).length), LX + LW, ly - 1, { align: "right" }); d.setTextColor(...rgb(C.ink));
      ly += 7.4;
    }
    if (portrait) { ly = MY + MH + 16; }
    const SX = portrait ? MX + 100 : LX;
    ly += 1; d.setFontSize(7.5); d.setTextColor(...rgb(C.mute)); d.text(T("Numéro : n° du poste (tableau)"), SX, ly); ly += 4.4;
    for (const s of ["complet", "partiel", "vide"] as const) { statusDot(d, SX + 1.3, ly - 1, POST_STATUS[s].color, 1.3); d.text(T(`Bénévoles : ${POST_STATUS[s].label.toLowerCase()}`), SX + 4.5, ly); ly += 4.4; }
    const st = staffing(ev, race.id);
    const SW = portrait ? W - 12 - SX : LW;
    ly += 2; d.setDrawColor(...rgb(C.line)); d.line(SX, ly, SX + SW, ly); ly += 5; d.setTextColor(...rgb(C.ink));
    d.setFont("helvetica", "bold"); d.setFontSize(9); d.text(T(`${st.posts} postes`), SX, ly); ly += 4.6; d.setFont("helvetica", "normal"); d.setFontSize(8);
    d.text(T(`Bénévoles : ${st.covered}/${st.need}`), SX, ly); ly += 4.2;
    d.text(T(`${st.by.complet} complet(s) · ${st.by.partiel} partiel(s) · ${st.by.vide} à pourvoir`), SX, ly, { maxWidth: SW }); ly += 8;
    if (posts.some((p) => (p.shared?.length ?? 0) > 0 || p.raceId !== race.id)) { d.setFontSize(7.5); d.setTextColor(...rgb(C.mute)); d.text(d.splitTextToSize(T("Les postes communs à plusieurs courses ont une seule équipe : ils sont comptés une fois au total de l'événement."), SW), SX, ly); d.setTextColor(...rgb(C.ink)); }
    // tableau des postes
    if (posts.length) {
      d.addPage("a4", "landscape"); let y = header(d, { kicker: "Postes de la course", title: ev.name, right: [race.label, raceLine(race)] });
      const rows: Cell[][] = [];
      for (const p of posts) {
        const vols = volunteersAt(ev, p.id), common = raceLabels(ev, p);
        rows.push([{ t: String(nums.get(p.id)?.n ?? ""), bold: true }, { t: p.name, icon: await pinIcon(p.kind), bold: true }, { t: POST_KINDS[p.kind].label }, { t: kmFr(kmOn(p, race.id)) }, { t: p.cutoffH != null ? hh(p.cutoffH) : "—" },
          { t: `${vols.length}/${p.staffNeeded}`, dot: p.staffNeeded > 0 ? POST_STATUS[postStatus(ev, p)].color : undefined },
          { t: vols.length ? vols.map((v) => `${v.name}${v.phone ? ` (${v.phone})` : ""}`).join(", ") : p.staffNeeded > 0 ? "À pourvoir" : "—", color: vols.length || !p.staffNeeded ? C.ink : C.red },
          { t: [common.length > 1 ? `Commun : ${common.join(", ")}.` : "", p.note].filter(Boolean).join(" ") || "—", color: C.ink2 }]);
      }
      y = table(d, [{ h: "N°", w: 10, align: "center" }, { h: "Poste", w: 58 }, { h: "Type", w: 30 }, { h: "Km", w: 14, align: "right" }, { h: "Barrière", w: 18 }, { h: "Bénév.", w: 18 }, { h: "Affectés", w: 64 }, { h: "Consignes", w: 61 }], rows, 12, y, { top: 14 });
    }
  }
  footers(d, SOURCE);
  return d.output("blob");
}

// ── Bénévoles : tableau d'affectation (une ligne par poste, postes communs une seule fois), puis une fiche par bénévole ──
export async function volunteersPdf(ev: EventModel, vols: Volunteer[], routes: RouteGeo[], opts: { style?: StyleSpecification; progress?: Progress; overview?: boolean } = {}): Promise<Blob> {
  const d = await newDoc("portrait"), W = pageW(d), H = pageH(d), nums = postNumbers(ev);
  const sub = `${dateFr(ev.date)}${ev.place ? ` · ${ev.place}` : ""}`;
  let started = false;
  if (opts.overview !== false && vols.length > 1) {
    started = true;
    let y = header(d, { kicker: "Bénévoles · tableau d'affectation", title: ev.name, right: [sub, ev.organizer ? `Organisation : ${ev.organizer}` : ""].filter(Boolean) });
    const st = staffing(ev);
    const chips: [string, string, string][] = [[`${st.need}`, "bénévoles nécessaires", C.ink], [`${st.covered}`, "places pourvues", C.green], [`${st.missing}`, "à trouver", st.missing ? C.red : C.green], [`${st.unassigned}`, "non affecté(s)", st.unassigned ? C.orange : C.mute]];
    const cw = (W - 24 - 9) / 4;
    chips.forEach(([n, l, col], i) => { const x = 12 + i * (cw + 3); d.setFillColor(...rgb(C.zebra)); d.roundedRect(x, y, cw, 16, 2, 2, "F"); d.setFont("helvetica", "bold"); d.setFontSize(15); d.setTextColor(...rgb(col)); d.text(n, x + 4, y + 8.5); d.setFont("helvetica", "normal"); d.setFontSize(7.5); d.setTextColor(...rgb(C.mute)); d.text(T(l), x + 4, y + 13); });
    d.setTextColor(...rgb(C.ink)); y += 21;
    if (st.mutualised > 0) { d.setFontSize(8); d.setTextColor(...rgb(C.pine)); d.text(T(`${st.common} poste(s) commun(s) à plusieurs courses : ${st.mutualised} bénévole(s) économisé(s) — chaque bénévole est compté une seule fois.`), 12, y); d.setTextColor(...rgb(C.ink)); y += 6; }
    const order = (p: Post) => ev.races.findIndex((r) => r.id === p.raceId);
    const posts = [...ev.posts].sort((a, b) => order(a) - order(b) || a.km - b.km);
    const rows: Cell[][] = [];
    for (const p of posts) {
      const vs = volunteersAt(ev, p.id);
      rows.push([{ t: String(nums.get(p.id)?.n ?? ""), bold: true }, { t: p.name, icon: await pinIcon(p.kind), bold: true }, { t: raceLabels(ev, p).join(" + ") }, { t: postRaceIds(p).map((r) => kmFr(kmOn(p, r))).join(" / ") },
        { t: `${vs.length}/${p.staffNeeded}`, dot: p.staffNeeded > 0 ? POST_STATUS[postStatus(ev, p)].color : undefined },
        { t: vs.length ? vs.map((v) => `${v.name}${v.phone ? ` · ${v.phone}` : ""}${v.from || v.to ? ` · ${v.from || "?"}–${v.to || "?"}` : ""}`).join("\n") : p.staffNeeded > 0 ? "À pourvoir" : "—", color: vs.length || !p.staffNeeded ? C.ink : C.red }]);
    }
    y = table(d, [{ h: "N°", w: 9, align: "center" }, { h: "Poste", w: 52 }, { h: "Course(s)", w: 32 }, { h: "Km", w: 17 }, { h: "Bénév.", w: 16 }, { h: "Affectés (téléphone, horaires)", w: 60 }], rows, 12, y, { top: 14, fontSize: 7.6 });
    const free = ev.volunteers.filter((v) => !v.postId || !ev.posts.some((p) => p.id === v.postId));
    if (free.length) { if (y > H - 40) { d.addPage(); y = 16; } y = sectionTitle(d, `Bénévoles non affectés (${free.length})`, 12, y + 8); d.setFontSize(8.5); d.text(d.splitTextToSize(T(free.map((v) => `${v.name}${v.phone ? ` (${v.phone})` : ""}`).join(" · ")), W - 24), 12, y); }
  }
  // fiches individuelles
  const maps = new Map<string, string | null>();
  for (let i = 0; i < vols.length; i++) {
    const v = vols[i], p = ev.posts.find((x) => x.id === v.postId);
    if (started || i) d.addPage(); started = true;
    opts.progress?.(`Fiche ${i + 1}/${vols.length} : ${v.name}…`);
    let y = header(d, { kicker: "Fiche bénévole", title: ev.name, right: [sub, ev.organizer ? `Organisation : ${ev.organizer}` : ""].filter(Boolean) });
    d.setFont("helvetica", "bold"); d.setFontSize(22); d.text(T(v.name), 12, y + 6); d.setFont("helvetica", "normal");
    d.setFontSize(9.5); d.setTextColor(...rgb(C.ink2)); d.text(T([v.phone && `Tél. ${v.phone}`, v.email].filter(Boolean).join("   ·   ") || "Coordonnées non renseignées"), 12, y + 12.5); d.setTextColor(...rgb(C.ink));
    y += 20;
    // carte d'affectation
    const boxH = 34; d.setFillColor(...rgb(C.zebra)); d.roundedRect(12, y, W - 24, boxH, 2.5, 2.5, "F");
    const status = p ? POST_STATUS[postStatus(ev, p)] : null;
    d.setFillColor(...rgb(p ? status!.color : C.mute)); d.roundedRect(12, y, 2.2, boxH, 1, 1, "F");
    if (p) {
      placePin(d, await pinIcon(p.kind), 23, y + 15, 11);
      d.setFontSize(7.5); d.setTextColor(...rgb(C.mute)); d.text(T(`POSTE ${nums.get(p.id)?.n ?? ""} · ${POST_KINDS[p.kind].label.toUpperCase()}`), 32, y + 7); d.setTextColor(...rgb(C.ink));
      d.setFont("helvetica", "bold"); d.setFontSize(14); d.text(d.splitTextToSize(T(p.name), W - 24 - 26)[0], 32, y + 13.5); d.setFont("helvetica", "normal");
      d.setFontSize(9); const races = postRaceIds(p);
      d.text(T(races.map((r) => `${ev.races.find((x) => x.id === r)?.label ?? "?"} : km ${kmFr(kmOn(p, r))}`).join("   ·   ")), 32, y + 19.5);
      d.text(T([`Horaires : ${v.from || "?"} – ${v.to || "?"}`, p.cutoffH != null ? `Barrière horaire : ${hh(p.cutoffH)} après le départ` : "", p.lat != null ? `GPS : ${p.lat.toFixed(5)}, ${p.lng!.toFixed(5)}` : ""].filter(Boolean).join("   ·   ")), 32, y + 25.5);
      d.setFontSize(7.5); d.setTextColor(...rgb(status!.color)); d.text(T(`Équipe : ${volunteersAt(ev, p.id).length}/${p.staffNeeded} — ${status!.label}`), 32, y + 30.5); d.setTextColor(...rgb(C.ink));
    } else { d.setFontSize(12); d.text(T("Non affecté à un poste pour l'instant."), 20, y + 15); d.setFontSize(9); d.text(T(`Horaires : ${v.from || "?"} – ${v.to || "?"}`), 20, y + 22); }
    y += boxH + 6;
    // mini-carte du poste
    if (p && p.lng != null && p.lat != null) {
      if (!maps.has(p.id)) {
        const lines = postRaceIds(p).map((rid) => routes.find((r) => r.id === ev.races.find((x) => x.id === rid)?.routeId)).filter((r): r is RouteGeo => !!r && r.coords.length > 1);
        try {
          // centrée sur le poste, au zoom des sentiers (environ 1,5 km de large)
          const snap = await snapshotMap({ width: 1110, height: 520, lines: lines.map((r) => ({ coords: r.coords.map((c) => [c[0], c[1]] as [number, number]), color: ROUTE_COLOR, width: 4.5 })), fit: [[p.lng, p.lat]], center: [p.lng, p.lat + 0.0006], zoom: 15, points: [[p.lng, p.lat]], style: opts.style });
          maps.set(p.id, JSON.stringify(snap));
        } catch { maps.set(p.id, null); }
      }
      const raw = maps.get(p.id);
      if (raw) {
        const snap = JSON.parse(raw) as { dataUrl: string; width: number; height: number; points: { x: number; y: number }[] }, MW = W - 24, MH = MW * (snap.height / snap.width), k = MW / snap.width;
        d.addImage(snap.dataUrl, "JPEG", 12, y, MW, MH, undefined, "FAST"); d.setDrawColor(...rgb(C.line)); d.rect(12, y, MW, MH, "S");
        placePin(d, await pinIcon(p.kind), 12 + snap.points[0].x * k, y + snap.points[0].y * k, 10);
        y += MH + 7;
      }
    }
    // consignes
    y = sectionTitle(d, "Consignes", 12, y + 2);
    const cons = [v.instructions.trim(), p?.note.trim() ? `Poste : ${p.note.trim()}` : ""].filter(Boolean).join("\n\n") || "Aucune consigne particulière : présentez-vous au responsable de l'événement.";
    d.setFontSize(10); const cl = d.splitTextToSize(T(cons), W - 30) as string[], ch = Math.min(cl.length * 4.6 + 6, H - y - 45);
    d.setFillColor(...rgb("#fff8ea")); d.setDrawColor(...rgb(C.brass)); d.setLineWidth(0.3); d.roundedRect(12, y - 3, W - 24, ch, 2, 2, "FD"); d.text(cl, 15, y + 2.5);
    y += ch + 5;
    // coéquipiers
    if (p) {
      const mates = volunteersAt(ev, p.id).filter((x) => x.id !== v.id);
      y = sectionTitle(d, "Au même poste", 12, y + 2); d.setFontSize(9.5);
      d.text(d.splitTextToSize(T(mates.length ? mates.map((x) => `${x.name}${x.phone ? ` — ${x.phone}` : ""}${x.from || x.to ? ` (${x.from || "?"}–${x.to || "?"})` : ""}`).join("\n") : "Vous êtes seul(e) affecté(e) à ce poste pour l'instant."), W - 24), 12, y);
    }
  }
  footers(d, `${ev.name} · document de terrain · ${SOURCE}`);
  return d.output("blob");
}

// ── Temps de passage ──
export async function passagePdf(ev: EventModel, race: Race, rows: PassageRow[], labels: string[], finishHours: number[]): Promise<Blob> {
  const d = await newDoc("landscape");
  let y = header(d, { kicker: "Temps de passage", title: ev.name, right: [race.label, raceLine(race), dateFr(ev.date)] });
  d.setFontSize(9); d.setTextColor(...rgb(C.ink2)); d.text(T(`Scénarios (durée totale) : ${labels.map((l, i) => `${l} ${hh(finishHours[i])}`).join("   ·   ")}`), 12, y); d.setTextColor(...rgb(C.ink)); y += 5;
  const nums = postNumbers(ev), cells: Cell[][] = [];
  for (const r of rows) cells.push([{ t: String(nums.get(r.post.id)?.n ?? ""), bold: true }, { t: kmFr(r.km) }, { t: r.post.name, icon: await pinIcon(r.post.kind), bold: true }, { t: POST_KINDS[r.post.kind].label }, { t: r.post.cutoffH != null ? hh(r.post.cutoffH) : "—" },
    ...r.times.map((t, i) => ({ t: `${t.clock}  (${hh(t.elapsedMin / 60)})`, color: r.late[i] ? C.red : C.ink, bold: r.late[i] }))]);
  table(d, [{ h: "N°", w: 10, align: "center" }, { h: "Km", w: 14, align: "right" }, { h: "Poste", w: 62 }, { h: "Type", w: 32 }, { h: "Barrière", w: 20 }, ...labels.map((l) => ({ h: l, w: (273 - 138) / labels.length }))], cells, 12, y, { top: 14, fontSize: 8.5 });
  footers(d, "Temps estimés au prorata de l'effort (km + D+/100). En rouge : passage après la barrière horaire. Document indicatif.");
  return d.output("blob");
}
