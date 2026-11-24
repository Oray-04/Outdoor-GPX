/**
 * Informations légales du site, en un seul endroit : mentions légales, politique de confidentialité, CGU et pied de page
 * les reprennent toutes, pour qu'elles restent cohérentes. Les valeurs « [À COMPLÉTER] » doivent être remplies avant la mise en ligne.
 */
export const LEGAL = {
  siteName: "Crête",
  /** Adresse publique du site (sert aussi au sitemap, au robots.txt et aux métadonnées) */
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL || "https://oray-04.github.io/Outdoor-GPX").replace(/\/$/, ""),
  /** Éditeur : particulier, site non professionnel, identité non publiée (LCEN, art. 1-1 III, ex-art. 6 III-2) */
  editor: { kind: "particulier-anonyme" as const },
  /** Adresse de contact : demandes générales et exercice des droits RGPD */
  contactEmail: "[À COMPLÉTER : adresse e-mail de contact]",
  /** Hébergeur du site (pages) */
  host: { name: "OVH SAS", address: "2 rue Kellermann, 59100 Roubaix, France", phone: "1007 (depuis la France) — +33 9 72 10 10 07", url: "https://www.ovhcloud.com" },
  /** Hébergeur des comptes et des données synchronisées */
  dataHost: { name: "Supabase, Inc.", address: "[À VÉRIFIER : adresse postale de Supabase, Inc.]", region: "France (Paris) — région de la base à confirmer lors de la création du projet", url: "https://supabase.com" },
  /** Date de dernière mise à jour des textes */
  updated: "24 novembre 2026",
} as const;

export const LEGAL_LINKS: [string, string][] = [
  ["Mentions légales", "/mentions-legales"],
  ["Confidentialité", "/confidentialite"],
  ["Cookies et stockage", "/cookies"],
  ["Conditions d'utilisation", "/cgu"],
];
