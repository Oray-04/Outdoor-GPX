"use client";
import { useEffect, useRef, useState } from "react";
import type { NutritionResult } from "@/lib/nutrition/engine";
import { fmtDur } from "@/lib/nutrition/labels";

/** Largeur réelle du conteneur : le graphique est dessiné à sa taille (textes lisibles sur mobile, pas de réduction). */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null); const [w, setW] = useState(0);
  useEffect(() => { const el = ref.current; if (!el) return; const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el); setW(el.clientWidth); return () => ro.disconnect(); }, []);
  return { ref, w };
}
const ticks = (max: number, maxN: number) => { const step = [15, 30, 60, 120, 180, 240, 360, 480, 720].find((s) => max / s <= maxN) ?? 1440; const out: number[] = []; for (let t = 0; t <= max + 1e-6; t += step) out.push(t); return out; };
const nice = (v: number) => { const p = Math.pow(10, Math.floor(Math.log10(Math.max(1, v)))); return Math.ceil(v / p / (v / p > 5 ? 2 : 1)) * p * (v / p > 5 ? 2 : 1); };

/**
 * Apports cumulés planifiés (escaliers : chaque prise) comparés à l'objectif (pointillés) au fil de la course.
 * Grand format : 300 px de haut (240 sur mobile), libellés en 12–13 px, ravitaillements repérés.
 */
export function CumulativeChart({ r, metric, color, unit, label }: { r: NutritionResult; metric: "carbsG" | "waterMl" | "sodiumMg"; color: string; unit: string; label: string }) {
  const { ref, w } = useWidth(), W = Math.max(280, w), small = W < 520, H = small ? 240 : 300, M = { l: small ? 44 : 54, r: 16, t: 18, b: 34 };
  const run = r.plan.slots.filter((s) => s.kind === "course"), dur = r.plan.points[r.plan.points.length - 1].tMin;
  let ct = 0, cg = 0; const target: [number, number][] = [[0, 0]], got: [number, number][] = [[0, 0]];
  run.forEach((s, k) => { ct += s.target[metric]; const end = k === run.length - 1 ? dur : s.tMin; target.push([end, ct]); got.push([s.tMin, cg]); cg += s.got[metric]; got.push([s.tMin, cg]); });
  got.push([dur, cg]);
  const top = nice(Math.max(1, ct, cg) * 1.05), x = (t: number) => M.l + (t / Math.max(1, dur)) * (W - M.l - M.r), y = (v: number) => H - M.b - (v / top) * (H - M.t - M.b);
  const path = (pts: [number, number][]) => pts.map(([t, v], k) => `${k ? "L" : "M"}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const yt = [0, 0.25, 0.5, 0.75, 1].map((f) => top * f), fs = small ? 12 : 13;
  const fmtV = (v: number) => (unit === "ml" && v >= 1000 ? `${(v / 1000).toFixed(1).replace(".", ",")} L` : String(Math.round(v)));
  return (
    <figure className="m-0">
      <div ref={ref} className="w-full">
        {w > 0 && <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img" aria-label={`${label} cumulés : prévu ${Math.round(cg)} ${unit} pour un objectif de ${Math.round(ct)} ${unit}`}>
          {yt.map((v) => <g key={v}><line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} stroke="#e3e7e1" /><text x={M.l - 6} y={y(v) + 4} fontSize={fs} textAnchor="end" fill="#5f7069">{fmtV(v)}</text></g>)}
          {ticks(dur, small ? 4 : 8).map((t) => <text key={t} x={x(t)} y={H - 10} fontSize={fs} textAnchor={t === 0 ? "start" : "middle"} fill="#5f7069">{t === 0 ? "départ" : fmtDur(t).replace(" h ", "h").replace(" min", "")}</text>)}
          {r.plan.points.slice(1, -1).map((p) => <g key={p.name + p.tMin}><line x1={x(p.tMin)} x2={x(p.tMin)} y1={M.t} y2={H - M.b} stroke="#cdb07a" strokeDasharray="3 4" /><text x={x(p.tMin) + 4} y={M.t + 12} fontSize={fs - 1} fill="#8f6f33">{small ? p.name.slice(0, 10) : p.name.slice(0, 22)}</text></g>)}
          <path d={path(target)} fill="none" stroke="#8a9a93" strokeWidth="2.5" strokeDasharray="7 5" />
          <path d={path(got)} fill="none" stroke={color} strokeWidth="3.5" strokeLinejoin="round" />
          <circle cx={x(dur)} cy={y(cg)} r="5" fill={color} />
        </svg>}
      </div>
      <figcaption className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-600"><span><span className="mr-1.5 inline-block h-1 w-6 rounded align-middle" style={{ background: color }} />Prévu : {fmtV(cg)} {unit === "ml" && cg >= 1000 ? "" : unit}</span><span><span className="mr-1.5 inline-block w-6 border-t-2 border-dashed border-ink-400 align-middle" />Objectif : {fmtV(ct)} {unit === "ml" && ct >= 1000 ? "" : unit}</span></figcaption>
    </figure>
  );
}
