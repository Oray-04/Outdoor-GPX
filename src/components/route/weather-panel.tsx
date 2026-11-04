"use client";
import { useEffect, useMemo, useState } from "react";
import { CloudRain, Wind, Thermometer, Loader2, TriangleAlert, Sun } from "lucide-react";
import clsx from "clsx";
import type { MapOverlay } from "@/components/map/route-map";
import type { RouteVM } from "@/lib/route-model";
import { WIND_COLOR, WIND_LABEL, WMO, addDays, evaluate, fetchForecasts, sampleRoute, startHourScores, wallMs, type Forecast, type WindClass } from "@/lib/weather";
import { fmtDuration, fmtKm } from "@/lib/geo";

const cardinal = (d: number) => ["N", "NE", "E", "SE", "S", "SO", "O", "NO"][Math.round(((d % 360) + 360) % 360 / 45) % 8];
const hhmm = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${h % 1 ? "30" : "00"}`;
const today = () => new Date().toISOString().slice(0, 10);

/** Météo et vent le long du parcours : conditions réellement vécues à l'heure de passage en chaque point. */
export function WeatherPanel({ route, onOverlay }: { route: RouteVM; onOverlay: (o: MapOverlay | null) => void }) {
  const km = route.stats.distanceM / 1000;
  const defSpeed = Math.round(Math.max(2, km / Math.max(0.2, route.durationMin / 60)) * 2) / 2;
  const [date, setDate] = useState(today());
  const [startH, setStartH] = useState(8);
  const [speed, setSpeed] = useState(defSpeed);
  const [forecasts, setForecasts] = useState<Forecast[] | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);

  const samples = useMemo(() => sampleRoute(route.coords, Math.min(24, Math.max(6, Math.ceil(km / 3)))), [route.coords, km]);
  const durationMin = (km / Math.max(1, speed)) * 60;

  useEffect(() => {
    if (!samples.length) return;
    const ctrl = new AbortController(); setState("loading"); setErr(null);
    fetchForecasts(samples.map((s) => [s.lng, s.lat]), date, addDays(date, 1), ctrl.signal).then((f) => { setForecasts(f); setState("idle"); })
      .catch((e) => { if ((e as Error).name !== "AbortError") { setErr((e as Error).message || "Météo indisponible."); setState("error"); setForecasts(null); } });
    return () => ctrl.abort();
  }, [samples, date]);

  const start = wallMs(`${date}T${hhmm(startH)}`);
  const res = useMemo(() => (forecasts && forecasts.length === samples.length ? evaluate(samples, forecasts, start, durationMin) : null), [forecasts, samples, start, durationMin]);
  const scores = useMemo(() => (forecasts && forecasts.length === samples.length ? startHourScores(samples, forecasts, date, durationMin) : null), [forecasts, samples, date, durationMin]);

  useEffect(() => {
    if (!res) { onOverlay(null); return; }
    onOverlay({
      segments: res.segments.map((s) => ({ from: s.fromIdx, to: s.toIdx, color: WIND_COLOR[s.cls] })),
      arrows: res.points.filter((p) => p.w).map((p) => ({ lng: p.lng, lat: p.lat, toDeg: ((p.w!.dir + 180) % 360), label: `${Math.round(p.w!.wind)}`, color: WIND_COLOR[p.cls], title: `km ${(p.distM / 1000).toFixed(1)} · vent ${Math.round(p.w!.wind)} km/h du ${cardinal(p.w!.dir)} (${WIND_LABEL[p.cls].toLowerCase()})` })),
    });
    return () => onOverlay(null);
  }, [res, onOverlay]);

  const best = scores ? Math.min(...scores.map((s) => s.score)) : 0, worst = scores ? Math.max(...scores.map((s) => s.score)) : 1;
  const cellColor = (sc: number) => { const t = worst === best ? 0 : (sc - best) / (worst - best); return `hsl(${Math.round(135 - 135 * Math.min(1, t * 1.15))} 60% 48%)`; };
  const x = res?.exposure;
  const inp = "h-10 rounded-lg border border-ink-200 bg-white px-3 text-sm";

  return (
    <section className="mt-6 rounded-2xl bg-white p-4 ring-1 ring-ink-100 sm:p-5" aria-label="Météo et vent le long du parcours">
      <h2 className="flex items-center gap-2 text-lg font-bold"><Wind className="size-5 text-glacier-600" />Météo et vent le long du parcours</h2>
      <p className="mt-1 text-sm text-ink-500">Conditions prévues à l'heure où vous passerez en chaque point, et vent par rapport à votre sens de déplacement.</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm font-medium">Jour<input type="date" className={inp} value={date} min={today()} max={addDays(today(), 15)} onChange={(e) => e.target.value && setDate(e.target.value)} /></label>
        <label className="grid gap-1 text-sm font-medium"><span className="flex justify-between">Départ<b className="font-display">{hhmm(startH)}</b></span><input type="range" min={0} max={23.5} step={0.5} value={startH} onChange={(e) => setStartH(+e.target.value)} className="h-10 accent-[var(--color-pine-600)]" aria-label="Heure de départ" /></label>
        <label className="grid gap-1 text-sm font-medium">Vitesse moyenne (km/h)<input type="number" min={1} max={60} step={0.5} className={inp} value={speed} onChange={(e) => setSpeed(Math.max(1, +e.target.value || 1))} /></label>
      </div>
      <p className="mt-1 text-xs text-ink-500">Durée estimée : {fmtDuration(durationMin)} · arrivée vers {hhmm(((startH + durationMin / 60) % 24))}{startH + durationMin / 60 >= 24 ? " (lendemain)" : ""}.</p>

      {state === "loading" && <p className="mt-4 flex items-center gap-2 text-sm text-ink-500" role="status"><Loader2 className="size-4 animate-spin" />Récupération des prévisions…</p>}
      {state === "error" && <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg bg-danger/10 p-3 text-sm text-danger"><TriangleAlert className="mt-0.5 size-4 shrink-0" />{err}</p>}

      {res && x && scores && (<>
        <div className="mt-4" role="group" aria-label="Meilleurs créneaux de départ">
          <p className="text-sm font-semibold">Quel créneau de départ ? <span className="font-normal text-ink-500">(vert : confortable, rouge : à éviter — pluie, vent de face, rafales, températures extrêmes)</span></p>
          <div className="mt-2 grid grid-cols-12 gap-1 sm:grid-cols-24" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
            {scores.map((s) => <button key={s.hour} type="button" onClick={() => setStartH(s.hour)} aria-label={`Départ à ${s.hour} h : ${s.exposure.precipMm.toFixed(1)} mm de pluie, ${s.exposure.facePct} % de vent de face`} title={`${s.hour} h — pluie ${s.exposure.precipMm.toFixed(1)} mm · vent de face ${s.exposure.facePct} %`} className={clsx("h-9 rounded text-[10px] font-semibold text-white", Math.floor(startH) === s.hour && "ring-2 ring-ink-900 ring-offset-1")} style={{ background: cellColor(s.score) }}>{s.hour}</button>)}
          </div>
          <p className="mt-1 text-xs text-ink-500">Meilleur départ le {date.split("-").reverse().join("/")} : <b>{scores.reduce((a, b) => (b.score < a.score ? b : a)).hour} h</b>.</p>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl bg-ink-50 p-3"><dt className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-ink-400"><Thermometer className="size-3.5" />Température</dt><dd className="font-display text-lg font-bold">{Math.round(x.tempMin)}–{Math.round(x.tempMax)} °C</dd></div>
          <div className="rounded-xl bg-ink-50 p-3"><dt className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-ink-400"><CloudRain className="size-3.5" />Pluie</dt><dd className="font-display text-lg font-bold">{x.precipMm.toFixed(1).replace(".", ",")} mm</dd><dd className="text-xs text-ink-500">probabilité max {Math.round(x.precipProbMax)} %</dd></div>
          <div className="rounded-xl bg-ink-50 p-3"><dt className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-ink-400"><Wind className="size-3.5" />Vent</dt><dd className="font-display text-lg font-bold">{Math.round(x.windAvg)} km/h</dd><dd className="text-xs text-ink-500">rafales jusqu'à {Math.round(x.maxGust)} km/h</dd></div>
          <div className="rounded-xl bg-ink-50 p-3"><dt className="text-[11px] font-medium uppercase tracking-wide text-ink-400">Bilan vent</dt><dd className="font-display text-lg font-bold">{x.avgHead >= 0 ? "+" : "−"}{Math.abs(Math.round(x.avgHead))} km/h</dd><dd className="text-xs text-ink-500">{x.avgHead >= 3 ? "plutôt de face" : x.avgHead <= -3 ? "plutôt dans le dos" : "équilibré"}</dd></div>
        </dl>

        <div className="mt-4"><p className="text-sm font-semibold">Exposition au vent sur {fmtKm(route.stats.distanceM)}</p>
          <div className="mt-1.5 flex h-5 overflow-hidden rounded-full" role="img" aria-label={`${x.facePct} % de vent de face, ${x.dosPct} % dans le dos, ${x.cotePct} % de côté, ${x.calmePct} % faible`}>
            {([["face", x.facePct], ["cote", x.cotePct], ["dos", x.dosPct], ["calme", x.calmePct]] as [WindClass, number][]).filter(([, v]) => v > 0).map(([c, v]) => <div key={c} style={{ width: `${v}%`, background: WIND_COLOR[c] }} title={`${WIND_LABEL[c]} : ${v} %`} />)}</div>
          <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">{([["face", x.facePct], ["cote", x.cotePct], ["dos", x.dosPct], ["calme", x.calmePct]] as [WindClass, number][]).map(([c, v]) => <li key={c} className="inline-flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-full" style={{ background: WIND_COLOR[c] }} />{WIND_LABEL[c]} {v} %</li>)}</ul>
          <p className="mt-1 text-xs text-ink-500">La carte ci-dessus colore le tracé selon le vent ; les flèches indiquent la direction vers laquelle il souffle (valeur : km/h).</p></div>

        <WeatherChart res={res} total={route.stats.distanceM} />

        <button type="button" className="mt-3 text-sm font-semibold text-pine-700 underline" aria-expanded={showTable} onClick={() => setShowTable((v) => !v)}>{showTable ? "Masquer" : "Afficher"} le détail point par point</button>
        {showTable && <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[34rem] text-sm"><thead><tr className="border-b border-ink-100 text-left text-ink-500"><th className="py-1.5">Km</th><th>Heure</th><th>Ciel</th><th>Temp.</th><th>Vent</th><th>Par rapport à vous</th><th>Pluie</th></tr></thead>
          <tbody>{res.points.map((p) => <tr key={p.index} className="border-b border-ink-50 last:border-0"><td className="py-1.5">{(p.distM / 1000).toFixed(1)}</td><td>{new Date(p.timeMs).toISOString().slice(11, 16)}</td><td>{p.w ? WMO[p.w.code] ?? "—" : "—"}</td><td>{p.w ? `${Math.round(p.w.temp)} °C` : "—"}</td><td>{p.w ? `${Math.round(p.w.wind)} km/h ${cardinal(p.w.dir)} (rafales ${Math.round(p.w.gust)})` : "—"}</td><td><span className="inline-flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-full" style={{ background: WIND_COLOR[p.cls] }} />{WIND_LABEL[p.cls]}</span></td><td>{p.w ? `${p.w.precip.toFixed(1)} mm` : "—"}</td></tr>)}</tbody></table></div>}
      </>)}
      <p className="mt-4 flex items-start gap-2 text-xs text-ink-500"><Sun className="mt-0.5 size-3.5 shrink-0" />Prévisions Open-Meteo (modèles à maille de quelques kilomètres), vent à 10 m. Elles ne tiennent pas compte du relief local (crêtes, couloirs, abris) : en montagne, le vent réel peut être très différent. Indicatif uniquement ; pour une sortie en altitude, consultez les bulletins officiels.</p>
    </section>
  );
}

function WeatherChart({ res, total }: { res: NonNullable<ReturnType<typeof evaluate>>; total: number }) {
  const W = 720, H = 190, L = 40, R = 10, rows = { wind: [8, 78], temp: [100, 140], rain: [158, 184] } as const;
  const pts = res.points.filter((p) => p.w); if (pts.length < 2) return null;
  const X = (d: number) => L + (d / (total || 1)) * (W - L - R);
  const maxH = Math.max(15, ...pts.map((p) => Math.abs(p.head))), mid = (rows.wind[0] + rows.wind[1]) / 2, sc = (rows.wind[1] - rows.wind[0]) / 2 / maxH;
  const temps = pts.map((p) => p.w!.temp), tMin = Math.min(...temps) - 1, tMax = Math.max(...temps) + 1;
  const TY = (t: number) => rows.temp[1] - ((t - tMin) / (tMax - tMin || 1)) * (rows.temp[1] - rows.temp[0]);
  const maxP = Math.max(1, ...pts.map((p) => p.w!.precip));
  return (
    <figure className="mt-4"><svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Vent de face ou dans le dos, température et pluie le long du parcours" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <text x={4} y={rows.wind[0] + 8} fontSize="9" fill="#d4202a">Face</text><text x={4} y={rows.wind[1]} fontSize="9" fill="#1e7a58">Dos</text>
      <line x1={L} x2={W - R} y1={mid} y2={mid} stroke="#cdd9d3" />
      {pts.slice(0, -1).map((p, i) => { const q = pts[i + 1]; const x1 = X(p.distM), x2 = X(q.distM), y1 = mid - p.head * sc, y2 = mid - q.head * sc; const c = (p.head + q.head) / 2 >= 0 ? "#d4202a" : "#1e7a58"; return <path key={i} d={`M${x1},${mid} L${x1},${y1} L${x2},${y2} L${x2},${mid} Z`} fill={c} opacity="0.35" />; })}
      <polyline points={pts.map((p) => `${X(p.distM)},${mid - p.head * sc}`).join(" ")} fill="none" stroke="#36504a" strokeWidth="1.5" />
      <text x={4} y={rows.temp[0] + 8} fontSize="9" fill="#74897f">{Math.round(tMax)}°</text><text x={4} y={rows.temp[1]} fontSize="9" fill="#74897f">{Math.round(tMin)}°</text>
      <polyline points={pts.map((p) => `${X(p.distM)},${TY(p.w!.temp)}`).join(" ")} fill="none" stroke="#f0612b" strokeWidth="2" />
      {pts.map((p, i) => <rect key={i} x={X(p.distM) - 4} width={8} y={rows.rain[1] - (p.w!.precip / maxP) * (rows.rain[1] - rows.rain[0])} height={(p.w!.precip / maxP) * (rows.rain[1] - rows.rain[0]) + 0.5} fill="#3ba6c9" />)}
      <text x={4} y={rows.rain[1]} fontSize="9" fill="#3ba6c9">mm</text>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => <text key={f} x={X(total * f)} y={H - 1} fontSize="9" fill="#74897f" textAnchor="middle">{((total * f) / 1000).toFixed(0)} km</text>)}
    </svg><figcaption className="text-xs text-ink-500">Haut : vent de face (rouge) ou dans le dos (vert) en km/h · milieu : température · bas : pluie par heure.</figcaption></figure>
  );
}
