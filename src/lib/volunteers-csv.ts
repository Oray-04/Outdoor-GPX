import { POST_KINDS, postNumbers, postRaceIds, postStatus, POST_STATUS, runnersAt, type EventModel } from "./events";

/**
 * Liste des bénévoles au format CSV, prête pour Excel (version française) :
 * séparateur « ; », encodage UTF-8 avec BOM (accents corrects), fins de ligne CRLF, champs entre guillemets si besoin.
 * Une ligne par bénévole ; un poste commun à plusieurs courses liste toutes ses courses (le bénévole n'est compté qu'une fois).
 */
export const CSV_COLUMNS = ["Nom", "Téléphone", "E-mail", "Horaires (début)", "Horaires (fin)", "Poste n°", "Poste", "Type de poste", "Course(s)", "Km", "Barrière horaire", "Coureurs attendus au poste", "Consignes du bénévole", "Consignes du poste", "État du poste", "Latitude", "Longitude"] as const;

const cell = (v: string | number | undefined | null) => {
  const s = v == null ? "" : String(v);
  // champs commençant par = + - @ : préfixés pour qu'Excel ne les interprète pas comme des formules
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s) ? `'${s}` : s;
  return /[";\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const num = (n: number | undefined, d = 1) => (n == null ? "" : n.toFixed(d).replace(".", ","));
const hours = (h: number | undefined) => (h == null ? "" : `${Math.floor(h)}h${String(Math.round((h % 1) * 60)).padStart(2, "0")}`);

export function volunteersCsv(ev: EventModel): string {
  const nums = postNumbers(ev), raceLabel = (id: string) => ev.races.find((r) => r.id === id)?.label ?? "";
  const rows = [...ev.volunteers].sort((a, b) => {
    const pa = ev.posts.find((p) => p.id === a.postId), pb = ev.posts.find((p) => p.id === b.postId);
    if (!pa !== !pb) return pa ? -1 : 1;
    if (pa && pb && pa.id !== pb.id) return (ev.races.findIndex((r) => r.id === pa.raceId) - ev.races.findIndex((r) => r.id === pb.raceId)) || pa.km - pb.km;
    return a.name.localeCompare(b.name, "fr");
  }).map((v) => {
    const p = ev.posts.find((x) => x.id === v.postId);
    if (!p) return [v.name, v.phone, v.email ?? "", v.from, v.to, "", "Non affecté", "", "", "", "", "", v.instructions, "", "", "", ""];
    const races = postRaceIds(p), kms = races.map((rid) => (rid === p.raceId ? p.km : p.shared?.find((s) => s.raceId === rid)?.km));
    return [v.name, v.phone, v.email ?? "", v.from, v.to, nums.get(p.id)?.n ?? "", p.name, POST_KINDS[p.kind].label, races.map(raceLabel).join(" + "), races.length > 1 ? kms.map((k) => num(k)).join(" / ") : num(p.km), hours(p.cutoffH), runnersAt(ev, p) ?? "", v.instructions, p.note, POST_STATUS[postStatus(ev, p)].label, p.lat != null ? p.lat.toFixed(6) : "", p.lng != null ? p.lng.toFixed(6) : ""];
  });
  return "﻿" + [CSV_COLUMNS as readonly string[], ...rows].map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
}
