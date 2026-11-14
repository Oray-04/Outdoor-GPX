"use client";
import type { NutritionResult } from "@/lib/nutrition/engine";
import { fmtDur } from "@/lib/nutrition/labels";

const W = 640, M = { l: 40, r: 14, t: 14, b: 26 };
const ticks = (max: number) => { const step = [15, 30, 60, 120, 180, 240, 360].find((s) => max / s <= 7) ?? 600; const out: number[] = []; for (let t = 0; t <= max + 1e-6; t += step) out.push(t); return out; };

/** Apports cumulés planifiés (escaliers : chaque prise) comparés à l'objectif (droite ou courbe de montée progressive). */
export function CumulativeChart({ r, metric, color, unit, label }: { r: NutritionResult; metric: "carbsG" | "waterMl" | "sodiumMg"; color: string; unit: string; label: string }) {
  const H = 170, run = r.plan.slots.filter((s) => s.kind === "course"), dur = r.plan.points[r.plan.points.length - 1].tMin;
  let ct = 0, cg = 0; const target: [number, number][] = [[0, 0]], got: [number, number][] = [[0, 0]];
  run.forEach((s, k) => { ct += s.target[metric]; const end = k === run.length - 1 ? dur : s.tMin; target.push([end, ct]); got.push([s.tMin, cg]); cg += s.got[metric]; got.push([s.tMin, cg]); });
  got.push([dur, cg]);
  const max = Math.max(1, ct, cg) * 1.08, x = (t: number) => M.l + (t / Math.max(1, dur)) * (W - M.l - M.r), y = (v: number) => H - M.b - (v / max) * (H - M.t - M.b);
  const path = (pts: [number, number][]) => pts.map(([t, v], k) => `${k ? "L" : "M"}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const yt = [0, 0.25, 0.5, 0.75, 1].map((f) => max / 1.08 * f);
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${label} cumulés : prévu ${Math.round(cg)} ${unit} pour un objectif de ${Math.round(ct)} ${unit}`}>
        {yt.map((v) => <g key={v}><line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} stroke="#e3e7e1" /><text x={M.l - 5} y={y(v) + 3} fontSize="9" textAnchor="end" fill="#5f7069">{Math.round(v)}</text></g>)}
        {ticks(dur).map((t) => <text key={t} x={x(t)} y={H - 8} fontSize="9" textAnchor="middle" fill="#5f7069">{fmtDur(t).replace(" h ", "h")}</text>)}
        <path d={path(target)} fill="none" stroke="#a0aea7" strokeWidth="2" strokeDasharray="5 4" />
        <path d={path(got)} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
        {r.plan.points.slice(1, -1).map((p) => <g key={p.name + p.tMin}><line x1={x(p.tMin)} x2={x(p.tMin)} y1={M.t} y2={H - M.b} stroke="#cdb07a" strokeDasharray="2 3" /><text x={x(p.tMin) + 3} y={M.t + 8} fontSize="8.5" fill="#8f6f33">{p.name.slice(0, 18)}</text></g>)}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 text-xs text-ink-500"><span><span className="mr-1 inline-block h-0.5 w-5 align-middle" style={{ background: color }} />Prévu ({Math.round(cg)} {unit})</span><span><span className="mr-1 inline-block w-5 border-t-2 border-dashed border-ink-300 align-middle" />Objectif ({Math.round(ct)} {unit})</span></figcaption>
    </figure>
  );
}

/** Caféine présente dans l'organisme au fil du temps (modèle de demi-vie), avec les prises. */
export function CaffeineChart({ r, startTime }: { r: NutritionResult; startTime: string }) {
  const c = r.caffeine, H = 170, dur = r.plan.points[r.plan.points.length - 1].tMin;
  if (!c.curve.length || !c.totalMg) return null;
  const t0 = c.curve[0].tMin, t1 = c.curve[c.curve.length - 1].tMin, max = Math.max(50, c.peakMg) * 1.15;
  const x = (t: number) => M.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - M.l - M.r), y = (v: number) => H - M.b - (v / max) * (H - M.t - M.b);
  const d = c.curve.map((p, k) => `${k ? "L" : "M"}${x(p.tMin).toFixed(1)},${y(p.mg).toFixed(1)}`).join("");
  const hh = (t: number) => { const m = /^(\d{1,2}):(\d{2})$/.exec(startTime); if (!m) return ""; const v = ((+m[1] * 60 + +m[2] + t) % 1440 + 1440) % 1440; return `${Math.floor(v / 60)}h${String(v % 60).padStart(2, "0")}`; };
  const marks: number[] = []; for (let t = Math.ceil(t0 / 120) * 120; t <= t1; t += t1 - t0 > 900 ? 240 : 120) marks.push(t);
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Caféine dans l'organisme : pic ${c.peakMg} mg, ${c.atFinishMg} mg à l'arrivée`}>
        {[0, 0.5, 1].map((f) => <g key={f}><line x1={M.l} x2={W - M.r} y1={y(max / 1.15 * f)} y2={y(max / 1.15 * f)} stroke="#e3e7e1" /><text x={M.l - 5} y={y(max / 1.15 * f) + 3} fontSize="9" textAnchor="end" fill="#5f7069">{Math.round(max / 1.15 * f)}</text></g>)}
        <rect x={x(0)} y={M.t} width={Math.max(0, x(dur) - x(0))} height={H - M.t - M.b} fill="#12624b" opacity="0.06" />
        <text x={x(0) + 4} y={M.t + 9} fontSize="8.5" fill="#12624b">Course</text>
        {marks.map((t) => <text key={t} x={x(t)} y={H - 8} fontSize="9" textAnchor="middle" fill="#5f7069">{hh(t)}</text>)}
        <path d={`${d}L${x(t1)},${y(0)}L${x(t0)},${y(0)}Z`} fill="#a67c2e" opacity="0.12" /><path d={d} fill="none" stroke="#a67c2e" strokeWidth="2.5" />
        {c.doses.map((k) => <g key={k.id}><line x1={x(k.atMin)} x2={x(k.atMin)} y1={M.t} y2={H - M.b} stroke="#a67c2e" strokeDasharray="2 3" /><text x={x(k.atMin) + 3} y={H - M.b - 4} fontSize="8.5" fill="#a67c2e">{k.mg} mg</text></g>)}
      </svg>
      <figcaption className="mt-1 text-xs text-ink-500">Quantité estimée dans l'organisme (mg), demi-vie de {c.halfLifeH} h. Pic ≈ {c.peakMg} mg · {c.atFinishMg} mg à l&apos;arrivée{c.atBedMg != null ? ` · ${c.atBedMg} mg au coucher` : ""}.</figcaption>
    </figure>
  );
}
