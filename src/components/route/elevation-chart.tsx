"use client";
import { type ReactNode, forwardRef, useEffect, useMemo, useRef, useState } from "react";
import type { ProfilePoint } from "@/lib/profile";
import { gradeColor } from "@/lib/profile";
import { rangeStats, type LngLatEle as Pt } from "@/lib/geo";

export interface ChartMarker { d: number; label: string; color: string; title: string }
interface Props {
  points: ProfilePoint[];
  markers?: ChartMarker[];
  onHover?: (index: number | null) => void;
  height?: number;
  /** position forcée (ex. survol de la carte) */
  activeIndex?: number | null;
  /** Zone sélectionnée (m depuis le départ). Contrôlée si `onSelect` est fourni, sinon gérée par le graphique. */
  selection?: { fromM: number; toM: number } | null;
  onSelect?: (s: { fromM: number; toM: number } | null) => void;
  /** Trace complète (avec altitudes) pour un calcul de D+/D− identique à celui du parcours ; à défaut, le profil. */
  coords?: Pt[];
  /** Actions supplémentaires affichées avec les statistiques de la zone (ex. extraire la section). */
  selectionActions?: ReactNode;
}

const M = { l: 48, r: 14, t: 22, b: 30 };
const FONT = "Inter, system-ui, sans-serif";

function niceStep(totalKm: number) {
  const raw = totalKm / 8;
  for (const s of [0.5, 1, 2, 5, 10, 20, 50]) if (s >= raw) return s;
  return 100;
}

export const ElevationChart = forwardRef<SVGSVGElement, Props>(function ElevationChart({ points, markers = [], onHover, height = 240, activeIndex, selection, onSelect, coords, selectionActions }, ref) {
  const [own, setOwn] = useState<{ fromM: number; toM: number } | null>(null);
  const [drag, setDrag] = useState<{ a: number; b: number; px0: number } | null>(null);
  const sel = drag && Math.abs(drag.b - drag.a) > 0 ? { fromM: Math.min(drag.a, drag.b), toM: Math.max(drag.a, drag.b) } : onSelect ? selection ?? null : own;
  const commit = (v: { fromM: number; toM: number } | null) => { if (onSelect) onSelect(v); else setOwn(v); };
  const selStats = useMemo(() => {
    if (!sel || sel.toM - sel.fromM <= 0) return null;
    const c: Pt[] = coords && coords.length > 1 ? coords : points.map((q) => [q.lng, q.lat, q.ele] as Pt);
    return rangeStats(c, sel.fromM, sel.toM);
  }, [sel?.fromM, sel?.toM, coords, points]); // eslint-disable-line react-hooks/exhaustive-deps
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(280, el.clientWidth)));
    ro.observe(el); setW(Math.max(280, el.clientWidth));
    return () => ro.disconnect();
  }, [points.length >= 2]); // le graphique n'existe qu'à partir de 2 points : on mesure sa largeur dès qu'il apparaît

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
  const dAt = (px: number) => Math.max(0, Math.min(geo.total, ((px - M.l) / geo.iw) * geo.total));
  const shown = hover ?? activeIndex ?? null;
  const p = shown != null ? points[shown] : null;
  const step = niceStep(geo.total / 1000);
  const xTicks: number[] = []; for (let k = 0; k * step * 1000 <= geo.total; k++) xTicks.push(k * step * 1000);
  const yStep = (geo.hi - geo.lo) > 600 ? 200 : (geo.hi - geo.lo) > 250 ? 100 : 50;
  const yTicks: number[] = []; for (let v = Math.ceil(geo.lo / yStep) * yStep; v <= geo.hi; v += yStep) yTicks.push(v);

  return (
    <div ref={wrap} className="w-full min-w-0 select-none">
      <svg ref={ref} className="block max-w-full" width={w} height={height} viewBox={`0 0 ${w} ${height}`} xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Profil altimétrique"
        style={{ touchAction: "pan-y", fontFamily: FONT }}
        onPointerDown={(e) => { if (e.button !== 0) return; const r = e.currentTarget.getBoundingClientRect(), x = e.clientX - r.left, d = dAt(x); e.currentTarget.setPointerCapture(e.pointerId); setDrag({ a: d, b: d, px0: x }); }}
        onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(), x = e.clientX - r.left; if (drag) setDrag({ ...drag, b: dAt(x) }); const i = idxAt(x); setHover(i); onHover?.(i); }}
        onPointerUp={(e) => { if (!drag) return; const r = e.currentTarget.getBoundingClientRect(), x = e.clientX - r.left; const a = drag.a, b = dAt(x); setDrag(null);
          if (Math.abs(x - drag.px0) < 6) commit(null); // simple clic : efface la sélection
          else commit({ fromM: Math.min(a, b), toM: Math.max(a, b) }); }}
        onPointerCancel={() => setDrag(null)}
        onPointerLeave={() => { if (!drag) { setHover(null); onHover?.(null); } }}>
        <rect width={w} height={height} fill="#ffffff" />
        {yTicks.map((v) => (<g key={v}><line x1={M.l} x2={w - M.r} y1={geo.y(v)} y2={geo.y(v)} stroke="#e4ebe7" /><text x={M.l - 6} y={geo.y(v) + 4} textAnchor="end" fontSize="11" fill="#74897f">{v}</text></g>))}
        {xTicks.map((d) => (<g key={d}><line x1={geo.x(d)} x2={geo.x(d)} y1={M.t} y2={height - M.b} stroke="#f0f4f1" /><text x={geo.x(d)} y={height - 10} textAnchor="middle" fontSize="11" fill="#74897f">{(d / 1000).toString().replace(".", ",")}</text></g>))}
        <text x={w - M.r} y={height - 10} textAnchor="end" fontSize="10" fill="#9db0a7">km</text>
        <text x={M.l} y={12} fontSize="10" fill="#9db0a7">m</text>
        <path d={geo.area} fill="#3ba6c9" opacity="0.12" />
        {sel && sel.toM > sel.fromM && (<g pointerEvents="none" data-selection="1">
          <rect x={geo.x(sel.fromM)} y={M.t} width={Math.max(1, geo.x(sel.toM) - geo.x(sel.fromM))} height={height - M.t - M.b} fill="#cdb07a" opacity="0.28" />
          <line x1={geo.x(sel.fromM)} x2={geo.x(sel.fromM)} y1={M.t} y2={height - M.b} stroke="#8f6f33" strokeWidth="2" />
          <line x1={geo.x(sel.toM)} x2={geo.x(sel.toM)} y1={M.t} y2={height - M.b} stroke="#8f6f33" strokeWidth="2" />
        </g>)}
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
      {selStats ? (
        <div role="status" aria-live="polite" data-zone="1" className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-brass-400/60 bg-brass-100/70 px-3 py-2 text-sm">
          <span className="font-semibold text-ink-800">Zone km {(selStats.fromM / 1000).toFixed(2).replace(".", ",")} → {(selStats.toM / 1000).toFixed(2).replace(".", ",")}</span>
          <span><b className="font-display">{(selStats.distanceM / 1000).toFixed(2).replace(".", ",")} km</b></span>
          <span className="text-ember-600"><b className="font-display">+{Math.round(selStats.gainM)} m</b> D+</span>
          <span className="text-glacier-600"><b className="font-display">−{Math.round(selStats.lossM)} m</b> D−</span>
          {Number.isFinite(selStats.minEle) && <span className="text-ink-600">{Math.round(selStats.minEle)}–{Math.round(selStats.maxEle)} m</span>}
          {selectionActions}
          <button type="button" onClick={() => commit(null)} className="ml-auto rounded-lg px-2 py-1 text-xs font-semibold text-ink-600 underline hover:bg-white/60">Effacer la zone</button>
        </div>
      ) : <p className="mt-1 text-[11px] text-ink-400">Astuce : cliquez-glissez sur le profil pour mesurer une zone (distance, D+, D−){onSelect ? " et la voir sur la carte" : ""}.</p>}
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-500" aria-hidden="true">
        {[["#4fb08f", "< 3 %"], ["#d9b300", "3–8 %"], ["#f0612b", "8–15 %"], ["#c8372d", "> 15 %"], ["#3ba6c9", "Descente"]].map(([c, l]) => <span key={l} className="inline-flex items-center gap-1"><i className="inline-block h-1.5 w-3 rounded" style={{ background: c }} />{l}</span>)}
      </div>
    </div>
  );
});
