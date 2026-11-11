/** Secteurs réels proposés comme points d'entrée vers la carte (aucun parcours associé). */
export interface Destination { id: string; name: string; country: string; blurb: string; center: [number, number]; hue: number }
export const DESTINATIONS: Destination[] = [
  { id: "chamonix", name: "Vallée de Chamonix", country: "France", blurb: "Hautes parois et grands sentiers d'altitude.", center: [6.87, 45.92], hue: 205 },
  { id: "vercors", name: "Vercors", country: "France", blurb: "Plateaux calcaires, gorges et forêts profondes.", center: [5.55, 45.07], hue: 150 },
  { id: "pyrenees", name: "Pyrénées centrales", country: "France", blurb: "Cirques glaciaires et lacs d'altitude.", center: [-0.01, 42.73], hue: 215 },
  { id: "dolomites", name: "Dolomites", country: "Italie", blurb: "Pâturages ouverts sous les tours de roche.", center: [11.85, 46.55], hue: 120 },
];
