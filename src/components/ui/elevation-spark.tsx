/** Mini profil altimétrique SVG (aperçu de carte). Le profil complet arrive à l'étape 6. */
export function ElevationSpark({ values, className = "h-12 w-full", stroke = "currentColor" }: { values: number[]; className?: string; stroke?: string }) {
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const W = 200, H = 48;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - 4 - ((v - min) / span) * (H - 10)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={className} role="img" aria-label="Profil altimétrique simplifié">
      <path d={`${line} L${W} ${H} L0 ${H} Z`} fill={stroke} opacity="0.14" />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
