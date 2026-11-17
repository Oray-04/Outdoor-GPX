/**
 * Disposition « en trèfle » des marqueurs qui se chevauchent : les points trop proches à l'écran (ou sur le papier)
 * sont écartés en pétales autour de leur centre commun, chacun relié par un trait fin à sa position réelle.
 * Calcul pur, en coordonnées d'écran (pixels) ou de page (mm) : utilisé par la carte logistique et par le PDF.
 */
export interface Pt2 { x: number; y: number }
export interface CloverOpts { /** distance en deçà de laquelle deux points se chevauchent */ threshold: number; /** rayon minimal du trèfle */ radius: number; /** surcroît de rayon par pétale */ perItem?: number;
  /** remonte le trèfle au-dessus de la position réelle (épingles dont la pointe est en bas) : la position réelle reste visible, sous le bouquet */ lift?: boolean; liftGap?: number }

/** Décalages (dx, dy) à appliquer à chaque point ; (0, 0) pour un point isolé. */
export function cloverOffsets(pts: Pt2[], o: CloverOpts): Pt2[] {
  const n = pts.length, parent = pts.map((_, i) => i), find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) < o.threshold) parent[find(i)] = find(j);
  const groups = new Map<number, number[]>(); pts.forEach((_, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), i]));
  const out: Pt2[] = pts.map(() => ({ x: 0, y: 0 }));
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const cx = g.reduce((s, i) => s + pts[i].x, 0) / g.length, cy = g.reduce((s, i) => s + pts[i].y, 0) / g.length;
    // ordre des pétales : direction de chaque point depuis le centre (le trèfle garde la disposition réelle), puis ordre d'origine
    const ord = [...g].sort((a, b) => { const da = Math.hypot(pts[a].x - cx, pts[a].y - cy), db = Math.hypot(pts[b].x - cx, pts[b].y - cy); if (da < 0.5 || db < 0.5) return a - b; return Math.atan2(pts[a].y - cy, pts[a].x - cx) - Math.atan2(pts[b].y - cy, pts[b].x - cx); });
    const R = o.radius + (o.perItem ?? 4) * Math.max(0, g.length - 2);
    // couronne orientée sur la direction réelle du premier point (ordre conservé) ; points confondus : gauche/droite pour 2, à partir du haut au-delà
    const f = pts[ord[0]], spread = Math.hypot(f.x - cx, f.y - cy) >= 0.5;
    const start = spread ? Math.atan2(f.y - cy, f.x - cx) : g.length === 2 ? Math.PI : -Math.PI / 2;
    const up = o.lift ? R + (o.liftGap ?? 6) : 0;
    ord.forEach((i, k) => { const a = start + (2 * Math.PI * k) / g.length; out[i] = { x: cx + R * Math.cos(a) - pts[i].x, y: cy - up + R * Math.sin(a) - pts[i].y }; });
  }
  return out;
}
