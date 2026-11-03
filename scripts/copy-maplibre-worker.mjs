// Copie le worker MapLibre dans public/ : le bundler ne sait pas le résoudre seul.
import { mkdirSync, copyFileSync } from "node:fs";
const src = "node_modules/maplibre-gl/dist/";
mkdirSync("public/maplibre", { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) copyFileSync(src + f, "public/maplibre/" + f);
