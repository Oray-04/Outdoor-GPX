import type { MetadataRoute } from "next";
import { LEGAL } from "@/lib/legal";

export const dynamic = "force-static";

/** Pages publiques principales (les fiches de parcours et d'événements sont générées dans le navigateur, à partir des données). */
const PAGES: [string, number][] = [
  ["/", 1], ["/explorer/", 0.9], ["/creer/", 0.9], ["/generer/", 0.8], ["/evenements/", 0.9], ["/organisateurs/", 0.8], ["/nutrition/", 0.8],
  ["/itineraires/", 0.7], ["/itinerance/", 0.6], ["/parcours/", 0.6], ["/collections/", 0.5], ["/fichiers/", 0.5], ["/hors-ligne/", 0.5], ["/feuille-de-route/", 0.3],
  ["/licences/", 0.4], ["/mentions-legales/", 0.2], ["/confidentialite/", 0.3], ["/cookies/", 0.2], ["/cgu/", 0.3],
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return PAGES.map(([p, priority]) => ({ url: `${LEGAL.siteUrl}${p}`, lastModified: now, changeFrequency: "monthly", priority }));
}
