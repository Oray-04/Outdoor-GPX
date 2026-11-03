export interface Place { label: string; lng: number; lat: number; zoom: number }

const ZOOM_BY_TYPE: Record<string, number> = { housenumber: 17, street: 15, locality: 14, municipality: 12 };

/** Géocodage : Géoplateforme (France) puis repli sur Nominatim/OSM (monde). */
export async function geocode(query: string): Promise<Place | null> {
  const q = encodeURIComponent(query.trim());
  try {
    const r = await fetch(`https://data.geopf.fr/geocodage/search?q=${q}&limit=1`);
    if (r.ok) {
      const j = (await r.json()) as { features: { geometry: { coordinates: [number, number] }; properties: { label: string; type: string; score: number } }[] };
      const f = j.features[0];
      if (f && f.properties.score > 0.5) return { label: f.properties.label, lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], zoom: ZOOM_BY_TYPE[f.properties.type] ?? 13 };
    }
  } catch { /* repli ci-dessous */ }
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=fr&q=${q}`);
  if (!r.ok) throw new Error(`geocode ${r.status}`);
  const [h] = (await r.json()) as { lat: string; lon: string; display_name: string }[];
  return h ? { label: h.display_name, lng: +h.lon, lat: +h.lat, zoom: 12 } : null;
}
