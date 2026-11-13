export const SITE = { name: "Crête", tagline: "Tracer. Explorer. Courir. Partager." };

/** Navigation principale : trois univers. Un groupe sans `items` est un lien direct. */
export interface NavItem { href: string; label: string; hint?: string }
export interface NavGroup { id: string; label: string; href: string; match: string[]; items?: NavItem[] }
export const NAV: NavGroup[] = [
  { id: "parcours", label: "Parcours", href: "/explorer", match: ["/explorer", "/creer", "/generer", "/itineraires", "/itinerance", "/parcours", "/fichiers", "/collections"], items: [
    { href: "/explorer", label: "Explorer", hint: "Vos parcours, GR et grandes traversées sur la carte" },
    { href: "/creer", label: "Créer un parcours", hint: "Tracer, importer et modifier un GPX" },
    { href: "/generer", label: "Générer une boucle", hint: "Selon une distance et un dénivelé" },
    { href: "/parcours", label: "Bibliothèque", hint: "Vos parcours, avec météo et itinérance" },
  ] },
  { id: "evenements", label: "Événements", href: "/evenements", match: ["/evenements", "/organisateurs", "/organisateur"], items: [
    { href: "/evenements", label: "Tous les événements", hint: "Calendrier et recherche" },
    { href: "/evenements/?sport=trail", label: "Trail et courses de montagne" },
    { href: "/evenements/?sport=velo", label: "Cyclisme" },
    { href: "/organisateurs", label: "Organisation Trail", hint: "Préparer son trail, étape par étape" },
  ] },
  { id: "nutrition", label: "Nutrition", href: "/nutrition", match: ["/nutrition"] },
];

export const ROADMAP = [
  { step: 1, title: "Identité visuelle et interface", status: "done" },
  { step: 2, title: "Authentification et base de données (comptes, partage entre membres)", status: "deferred" },
  { step: 3, title: "Cartographie interactive (cartes IGN)", status: "done" },
  { step: 4, title: "Éditeur de parcours GPS", status: "done" },
  { step: 5, title: "Import et export GPS", status: "done" },
  { step: 6, title: "Fiches parcours et profils altimétriques", status: "done" },
  { step: 7, title: "Événements et espace organisateurs", status: "done" },
  { step: 8, title: "Communauté locale, espace personnel", status: "done" },
  { step: 9, title: "Administration locale", status: "done" },
  { step: 10, title: "Tests, sécurité, performance (mise en production : à faire avec l'étape 2)", status: "partial" },
] as const;
