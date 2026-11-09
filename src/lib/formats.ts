import type { Pt, Poi, PoiType } from "./types";
import { uid } from "./types";

export type GpsFormat = "gpx" | "kml" | "geojson" | "tcx";
export const FORMATS: Record<GpsFormat, { label: string; ext: string; mime: string }> = {
  gpx: { label: "GPX", ext: "gpx", mime: "application/gpx+xml" },
  kml: { label: "KML", ext: "kml", mime: "application/vnd.google-earth.kml+xml" },
  geojson: { label: "GeoJSON", ext: "geojson", mime: "application/geo+json" },
  tcx: { label: "TCX", ext: "tcx", mime: "application/vnd.garmin.tcx+xml" },
};

export interface ParsedFile { name: string; coords: Pt[]; pois: Poi[]; warnings: string[]; format: GpsFormat; hadElevation: boolean }
export class GpsFileError extends Error {}

export const MAX_BYTES = 25 * 1024 * 1024;
const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);

interface Raw { lng: number; lat: number; ele?: number }

function finish(format: GpsFormat, name: string, raws: Raw[], pois: Poi[], warnings: string[]): ParsedFile {
  const good: Raw[] = [];
  let bad = 0;
  for (const r of raws) {
    if (Number.isFinite(r.lng) && Number.isFinite(r.lat) && Math.abs(r.lat) <= 90 && Math.abs(r.lng) <= 180) good.push(r); else bad++;
  }
  if (bad) warnings.push(`${bad} point(s) aux coordonnées invalides ont été ignorés.`);
  if (good.length < 2) throw new GpsFileError("Le fichier ne contient pas de tracé exploitable (au moins 2 points valides sont nécessaires).");
  const withEle = good.filter((g) => Number.isFinite(g.ele)).length;
  const hadElevation = withEle > good.length * 0.8;
  if (!hadElevation) warnings.push(withEle ? "Altitudes incomplètes : elles seront recalculées." : "Aucune altitude dans le fichier : elle sera recalculée.");
  let prev = 0;
  const coords: Pt[] = good.map((g) => { if (Number.isFinite(g.ele)) prev = g.ele!; return [g.lng, g.lat, prev]; });
  if (coords.length > 100000) warnings.push("Fichier très volumineux (> 100 000 points) : l'affichage peut être lent.");
  return { name: name || "Sans titre", coords, pois, warnings, format, hadElevation };
}

function dom(text: string, kind: string): Document {
  const d = new DOMParser().parseFromString(text, "application/xml");
  if (d.getElementsByTagName("parsererror").length) throw new GpsFileError(`Fichier ${kind} illisible : le XML est mal formé.`);
  return d;
}
const txt = (el: Element | null | undefined, tag: string) => el?.getElementsByTagName(tag)[0]?.textContent?.trim() ?? "";
const num = (s: string) => (s === "" ? NaN : Number(s));

function poiTypeFrom(s: string): PoiType {
  const t = s.toLowerCase();
  if (/ravit|food|aid/.test(t)) return "ravito";
  if (/eau|water|fontaine/.test(t)) return "eau";
  if (/contr|check/.test(t)) return "controle";
  if (/vue|view|summit|sommet/.test(t)) return "vue";
  if (/danger|warn|!|passage|franchi|crossing/.test(t)) return "danger";
  if (/secours|first|medic/.test(t)) return "secours";
  if (/park/.test(t)) return "parking";
  return "vue";
}

export function parseGpx(text: string): ParsedFile {
  const d = dom(text, "GPX");
  if (d.documentElement.localName !== "gpx") throw new GpsFileError("Ce fichier n'est pas un GPX (balise <gpx> absente).");
  const warnings: string[] = [];
  const pick = (tag: string) => Array.from(d.getElementsByTagName(tag));
  let pts = pick("trkpt");
  if (!pts.length) { pts = pick("rtept"); if (pts.length) warnings.push("Itinéraire (rte) converti en tracé."); }
  const raws = pts.map((p) => ({ lng: num(p.getAttribute("lon") ?? ""), lat: num(p.getAttribute("lat") ?? ""), ele: num(txt(p, "ele")) }));
  const pois: Poi[] = pick("wpt").map((w) => ({ id: uid(), type: poiTypeFrom(txt(w, "type") || txt(w, "sym") || txt(w, "name")), name: txt(w, "name") || "Point", lng: num(w.getAttribute("lon") ?? ""), lat: num(w.getAttribute("lat") ?? "") })).filter((p) => Number.isFinite(p.lng) && Number.isFinite(p.lat));
  const meta = d.getElementsByTagName("metadata")[0];
  const name = txt(meta, "name") || txt(d.getElementsByTagName("trk")[0], "name") || txt(d.getElementsByTagName("rte")[0], "name");
  return finish("gpx", name, raws, pois, warnings);
}

export function parseKml(text: string): ParsedFile {
  const d = dom(text, "KML");
  if (d.documentElement.localName !== "kml") throw new GpsFileError("Ce fichier n'est pas un KML (balise <kml> absente).");
  const warnings: string[] = [];
  const raws: Raw[] = [];
  const pois: Poi[] = [];
  for (const pm of Array.from(d.getElementsByTagName("Placemark"))) {
    const name = txt(pm, "name");
    for (const ls of Array.from(pm.getElementsByTagName("LineString"))) {
      for (const tup of txt(ls, "coordinates").split(/\s+/).filter(Boolean)) { const [x, y, z] = tup.split(",").map(Number); raws.push({ lng: x, lat: y, ele: z }); }
    }
    for (const c of Array.from(pm.getElementsByTagName("gx:coord"))) { const [x, y, z] = (c.textContent ?? "").trim().split(/\s+/).map(Number); raws.push({ lng: x, lat: y, ele: z }); }
    const pt = pm.getElementsByTagName("Point")[0];
    if (pt) { const [x, y] = txt(pt, "coordinates").split(",").map(Number); if (Number.isFinite(x) && Number.isFinite(y)) pois.push({ id: uid(), type: poiTypeFrom(name), name: name || "Point", lng: x, lat: y }); }
  }
  const first = d.getElementsByTagName("Placemark")[0];
  return finish("kml", txt(d.getElementsByTagName("Document")[0], "name") || txt(first, "name"), raws, pois, warnings);
}

export function parseGeoJson(text: string): ParsedFile {
  let j: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  try { j = JSON.parse(text); } catch { throw new GpsFileError("Fichier GeoJSON illisible : JSON invalide."); }
  const feats: any[] = j?.type === "FeatureCollection" ? j.features ?? [] : j?.type === "Feature" ? [j] : j?.type ? [{ type: "Feature", properties: {}, geometry: j }] : []; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!feats.length) throw new GpsFileError("Ce fichier n'est pas un GeoJSON valide.");
  const raws: Raw[] = []; const pois: Poi[] = []; const warnings: string[] = [];
  let name = "";
  const push = (c: number[]) => raws.push({ lng: c[0], lat: c[1], ele: c[2] });
  for (const f of feats) {
    const g = f?.geometry; if (!g) continue;
    name ||= f.properties?.name ?? "";
    if (g.type === "LineString") g.coordinates.forEach(push);
    else if (g.type === "MultiLineString") { if (g.coordinates.length > 1) warnings.push("Plusieurs lignes fusionnées en un seul tracé."); g.coordinates.forEach((l: number[][]) => l.forEach(push)); }
    else if (g.type === "Point") pois.push({ id: uid(), type: poiTypeFrom(f.properties?.type ?? f.properties?.name ?? ""), name: f.properties?.name ?? "Point", lng: g.coordinates[0], lat: g.coordinates[1] });
  }
  return finish("geojson", name, raws, pois, warnings);
}

export function parseTcx(text: string): ParsedFile {
  const d = dom(text, "TCX");
  if (d.documentElement.localName !== "TrainingCenterDatabase") throw new GpsFileError("Ce fichier n'est pas un TCX.");
  const raws = Array.from(d.getElementsByTagName("Trackpoint")).map((t) => {
    const pos = t.getElementsByTagName("Position")[0];
    return { lat: num(txt(pos, "LatitudeDegrees")), lng: num(txt(pos, "LongitudeDegrees")), ele: num(txt(t, "AltitudeMeters")) };
  }).filter((r) => !(Number.isNaN(r.lat) && Number.isNaN(r.lng))); // points sans GPS ignorés
  const name = txt(d.getElementsByTagName("Course")[0], "Name") || txt(d.getElementsByTagName("Activity")[0], "Id");
  return finish("tcx", name, raws, [], []);
}

export function detectFormat(text: string, fileName = ""): GpsFormat {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "gpx" || ext === "kml" || ext === "tcx") return ext;
  if (ext === "geojson" || ext === "json") return "geojson";
  const t = text.trimStart().slice(0, 500).toLowerCase();
  if (t.startsWith("{")) return "geojson";
  if (t.includes("<gpx")) return "gpx";
  if (t.includes("<kml")) return "kml";
  if (t.includes("trainingcenterdatabase")) return "tcx";
  throw new GpsFileError("Format non reconnu. Formats acceptés : GPX, KML, GeoJSON, TCX.");
}

export function parseAny(text: string, fileName = ""): ParsedFile {
  if (!text.trim()) throw new GpsFileError("Le fichier est vide.");
  const f = detectFormat(text, fileName);
  const r = { gpx: parseGpx, kml: parseKml, geojson: parseGeoJson, tcx: parseTcx }[f](text);
  if (!r.name || r.name === "Sans titre") r.name = fileName.replace(/\.[^.]+$/, "") || "Sans titre";
  return r;
}

export interface Exportable { name: string; description?: string; coords: Pt[]; pois: Poi[] }
const r6 = (n: number) => n.toFixed(6);

export function toGpx(r: Exportable): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Crête" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${esc(r.name)}</name>${r.description ? `<desc>${esc(r.description)}</desc>` : ""}</metadata>
${r.pois.map((p) => `  <wpt lat="${r6(p.lat)}" lon="${r6(p.lng)}"><name>${esc(p.name)}</name><type>${esc(p.type)}</type></wpt>`).join("\n")}
  <trk><name>${esc(r.name)}</name><trkseg>
${r.coords.map((c) => `    <trkpt lat="${r6(c[1])}" lon="${r6(c[0])}"><ele>${c[2]}</ele></trkpt>`).join("\n")}
  </trkseg></trk>
</gpx>
`;
}

export function toKml(r: Exportable): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(r.name)}</name>
${r.pois.map((p) => `<Placemark><name>${esc(p.name)}</name><description>${esc(p.type)}</description><Point><coordinates>${r6(p.lng)},${r6(p.lat)},0</coordinates></Point></Placemark>`).join("\n")}
<Placemark><name>${esc(r.name)}</name><LineString><tessellate>1</tessellate><altitudeMode>clampToGround</altitudeMode><coordinates>
${r.coords.map((c) => `${r6(c[0])},${r6(c[1])},${c[2]}`).join("\n")}
</coordinates></LineString></Placemark></Document></kml>
`;
}

export function toGeoJson(r: Exportable): string {
  return JSON.stringify({
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { name: r.name, description: r.description ?? "" }, geometry: { type: "LineString", coordinates: r.coords.map((c) => [+r6(c[0]), +r6(c[1]), c[2]]) } },
      ...r.pois.map((p) => ({ type: "Feature", properties: { name: p.name, type: p.type }, geometry: { type: "Point", coordinates: [+r6(p.lng), +r6(p.lat)] } })),
    ],
  }, null, 2);
}

export function toTcx(r: Exportable): string {
  let d = 0;
  const pts = r.coords.map((c, i) => {
    if (i) { const a = r.coords[i - 1]; d += approxDist(a, c); }
    return `<Trackpoint><Position><LatitudeDegrees>${r6(c[1])}</LatitudeDegrees><LongitudeDegrees>${r6(c[0])}</LongitudeDegrees></Position><AltitudeMeters>${c[2]}</AltitudeMeters><DistanceMeters>${d.toFixed(1)}</DistanceMeters></Trackpoint>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Courses><Course><Name>${esc(r.name.slice(0, 15))}</Name>
<Track>
${pts.join("\n")}
</Track></Course></Courses></TrainingCenterDatabase>
`;
}
function approxDist(a: number[], b: number[]) {
  const k = 111320, dx = (b[0] - a[0]) * k * Math.cos(((a[1] + b[1]) / 2 * Math.PI) / 180), dy = (b[1] - a[1]) * 110574;
  return Math.hypot(dx, dy);
}

export function serialize(f: GpsFormat, r: Exportable): string {
  return { gpx: toGpx, kml: toKml, geojson: toGeoJson, tcx: toTcx }[f](r);
}

export function download(fileName: string, content: string | Blob, mime: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fileName; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const safeName = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "parcours";
