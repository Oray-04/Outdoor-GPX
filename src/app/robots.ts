import type { MetadataRoute } from "next";
import { LEGAL } from "@/lib/legal";

export const dynamic = "force-static";

/** Ouvert à tous les robots (moteurs de recherche et agents IA), sauf les espaces personnels et techniques. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin/", "/compte/", "/connexion/", "/integrer/", "/partage/", "/charte/", "/organisateurs/gerer/", "/organisateurs/logistique/"] }],
    sitemap: `${LEGAL.siteUrl}/sitemap.xml`,
  };
}
