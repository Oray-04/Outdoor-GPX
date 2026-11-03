import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Crête", short_name: "Crête", description: "Parcours GPS, trail, randonnée, vélo et événements.",
    start_url: "/suivi", display: "standalone", background_color: "#f7f6f1", theme_color: "#0d1b17", lang: "fr",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
