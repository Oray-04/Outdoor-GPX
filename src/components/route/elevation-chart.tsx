"use client";
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import type { ProfilePoint } from "@/lib/profile";
import { gradeColor } from "@/lib/profile";

export interface ChartMarker { d: number; label: string; color: string; title: string }
interface Props {
  points: ProfilePoint[];
  markers?: ChartMarker[];
  onHover?: (index: number | null) => void;
  height?: number;
  /** position forcée (ex. survol de la carte) */
  activeIndex?: number | null;
}

const M = { l: 48, r: 14, t: 22, b: 30 };
const FONT = "Inter, system-ui, sans-serif";

function niceStep(totalKm: number) {
  const raw = totalKm / 8;
  for (const s of [0.5, 1, 2, 5, 10, 20, 50]) if (s >= raw) return s;
  return 100;
}

export const ElevationChart = forwardRef<SVGSVGElement, Props>(function ElevationChart({ points, markers = [], onHover, height = 240, activeIndex }, ref) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(280, el.clientWidth)));
    ro.observe(el); setW(Math.max(280, el.clientWidth));
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    if (points.length < 2) return null;
    const total = points[points.length - 1].d || 1;
    let min = Infinity, max = -Infinity;
    for (const p of points) { min = Math.min(min, p.ele); max = Math.max(max, p.ele); }
    const pad = Math.max(10, (max - min) * 0.1);
    const lo = Math.floor((min - pad) / 10) * 10, hi = Math.ceil((max + pad) / 10) * 10;
    const iw = w - M.l - M.r, ih = height - M.t - M.b;
    const x = (d: number) => M.l + (d / total) * iw;
    const y = (e: number) => M.t + ih - ((e - lo) / (hi - lo)) * ih;
    // segments colorés par classe de pente
    const runs: { c: string; pts: string[] }[] = [];
    points.forEach((p, i) => {
      const c = gradeColor(p.grade);
      const pt = `${x(p.d).toFixed(1)},${y(p.ele).toFixed(1)}`;
      const last = runs[runs.length - 1];
      if (last && last.c === c) last.pts.push(pt);
      else { if (last && i > 0) last.pts.push(pt); runs.push({ c, pts: [pt] }); }
    });
    const area = `M${x(0)},${y(lo)} ` + points.map((p) => `L${x(p.d).toFixed(1)},${y(p.ele).toFixed(1)}`).join(" ") + ` L${x(total)},${y(lo)} Z`;
    return { total, lo, hi, x, y, runs, area, iw, ih };
  }, [points, w, height]);

  if (!geo) return <div className="grid h-40 place-items-center rounded-xl bg-ink-50 text-sm text-ink-500">Tracez au moins 2 points pour voir le profil.</div>;

  const idxAt = (px: number) => {
    const d = ((px - M.l) / geo.iw) * geo.total;
    let a = 0, b = points.length - 1;
    while (a < b) { const m = (a + b) >> 1; if (points[m].d < d) a = m + 1; else b = m; }
    return Math.max(0, Math.min(points.length - 1, a));
  };
  const shown = hover ?? activeIndex ?? null;
  const p = shown != null ? points[shown] : null;
  const step = niceStep(geo.total / 1000);
  const xTicks: number[] = []; for (let k = 0; k * step * 1000 <= geo.total; k++) xTicks.push(k * step * 1000);
  const yStep = (geo.hi - geo.lo) > 600 ? 200 : (geo.hi - geo.lo) > 250 ? 100 : 50;
  const yTicks: number[] = []; for (let v = Math.ceil(geo.lo / yStep) * yStep; v <= geo.hi; v += yStep) yTicks.push(v);

  return (
    <div ref={wrap} className="w-full select-none">
      <svg ref={ref} width={w} height={height} viewBox={`0 0 ${w} ${height}`} xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Profil altimétrique"
        style={{ touchAction: "pan-y", fontFamily: FONT }}
        onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const i = idxAt(e.clientX - r.left); setHover(i); onHover?.(i); }}
        onPointerLeave={() => { setHover(null); onHover?.(null); }}>
        <rect width={w} height={height} fill="#ffffff" />
        {yTicks.map((v) => (<g key={v}><line x1={M.l} x2={w - M.r} y1={geo.y(v)} y2={geo.y(v)} stroke="#e4ebe7" /><text x={M.l - 6} y={geo.y(v) + 4} textAnchor="end" fontSize="11" fill="#74897f">{v}</text></g>))}
        {xTicks.map((d) => (<g key={d}><line x1={geo.x(d)} x2={geo.x(d)} y1={M.t} y2={height - M.b} stroke="#f0f4f1" /><text x={geo.x(d)} y={height - 10} textAnchor="middle" fontSize="11" fill="#74897f">{(d / 1000).toString().replace(".", ",")}</text></g>))}
        <text x={w - M.r} y={height - 10} textAnchor="end" fontSize="10" fill="#9db0a7">km</text>
        <text x={M.l} y={12} fontSize="10" fill="#9db0a7">m</text>
        <path d={geo.area} fill="#3ba6c9" opacity="0.12" />
        {geo.runs.map((r, i) => <polyline key={i} points={r.pts.join(" ")} fill="none" stroke={r.c} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />)}
        {markers.map((m, i) => (
          <g key={i}><title>{m.title}</title>
            <line x1={geo.x(m.d)} x2={geo.x(m.d)} y1={M.t} y2={height - M.b} stroke={m.color} strokeDasharray="3 3" opacity="0.7" />
            <circle cx={geo.x(m.d)} cy={M.t - 4} r="8" fill={m.color} /><text x={geo.x(m.d)} y={M.t - 0.5} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">{m.label}</text></g>
        ))}
        {p && (<g pointerEvents="none">
          <line x1={geo.x(p.d)} x2={geo.x(p.d)} y1={M.t} y2={height - M.b} stroke="#0d1b17" strokeWidth="1" />
          <circle cx={geo.x(p.d)} cy={geo.y(p.ele)} r="5" fill="#f0612b" stroke="#fff" strokeWidth="2" />
          {(() => { const bx = Math.min(Math.max(geo.x(p.d) - 62, M.l), w - M.r - 124); return (<g>
            <rect x={bx} y={M.t + 2} width="124" height="40" rx="6" fill="#0d1b17" opacity="0.92" />
            <text x={bx + 8} y={M.t + 17} fontSize="11" fill="#fff" fontWeight="600">{(p.d / 1000).toFixed(2).replace(".", ",")} km · {Math.round(p.ele)} m</text>
            <text x={bx + 8} y={M.t + 33} fontSize="11" fill="#cdd9d3">Pente {p.grade >= 0 ? "+" : ""}{p.grade.toFixed(1).replace(".", ",")} %</text></g>); })()}
        </g>)}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-500" aria-hidden="true">
        {[["#4fb08f", "< 3 %"], ["#d9b300", "3–8 %"], ["#f0612b", "8–15 %"], ["#c8372d", "> 15 %"], ["#3ba6c9", "Descente"]].map(([c, l]) => <span key={l} className="inline-flex items-center gap-1"><i className="inline-block h-1.5 w-3 rounded" style={{ background: c }} />{l}</span>)}
      </div>
    </div>
  );
});
