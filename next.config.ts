import type { NextConfig } from "next";

/** Services externes autorisés : Géoplateforme IGN (tuiles, altitude, itinéraire, géocodage), OpenStreetMap (tuiles de repli, Nominatim, Overpass). */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://data.geopf.fr https://tile.openstreetmap.org",
  "font-src 'self' data:",
  "connect-src 'self' blob: https://data.geopf.fr https://tile.openstreetmap.org https://nominatim.openstreetmap.org https://overpass-api.de",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=(), payment=()" },
      ],
    }];
  },
};

export default nextConfig;
