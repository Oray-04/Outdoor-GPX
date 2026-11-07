/**
 * Politique de sécurité des contenus, posée par balise <meta> (l'hébergement statique ne permet pas d'en-têtes HTTP).
 * Services externes autorisés : Géoplateforme IGN et OpenStreetMap (tuiles de repli, Nominatim, Overpass).
 * `frame-ancestors` n'est pas applicable via <meta> : l'anti-intégration (clickjacking) dépend de l'hébergeur.
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://data.geopf.fr https://tile.openstreetmap.org https://tile.opentopomap.org https://api.thunderforest.com https://tile.thunderforest.com",
  "font-src 'self' data:",
  "connect-src 'self' blob: https://data.geopf.fr https://tile.openstreetmap.org https://tile.opentopomap.org https://api.thunderforest.com https://tile.thunderforest.com https://nominatim.openstreetmap.org https://overpass-api.de https://overpass.kumi.systems https://valhalla1.openstreetmap.de https://api.open-meteo.com https://geo.api.gouv.fr https://apicarto.ign.fr https://hiking.waymarkedtrails.org https://*.supabase.co wss://*.supabase.co",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");
