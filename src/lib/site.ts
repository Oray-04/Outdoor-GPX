export const SITE = { name: "Crête", tagline: "Tracer. Explorer. Courir. Partager." };

export const NAV = [
  { href: "/explorer", label: "Explorer" },
  { href: "/creer", label: "Créer un parcours" },
  { href: "/generer", label: "Générer" },
  { href: "/parcours", label: "Parcours" },
  { href: "/itineraires", label: "Itinéraires" },
  { href: "/evenements", label: "Événements" },
  { href: "/organisateurs", label: "Organisateurs" },
  { href: "/communaute", label: "Communauté" },
] as const;

export const ROADMAP = [
  { step: 1, title: "Identité visuelle et interface", status: "done" },
  { step: 2, title: "Authentification et base de données (comptes, partage entre membres)", status: "deferred" },
  { step: 3, title: "Cartographie interactive (cartes IGN)", status: "done" },
  { step: 4, title: "Éditeur de parcours GPS", status: "done" },
  { step: 5, title: "Import et export GPS", status: "done" },
  { step: 6, title: "Fiches parcours et profils altimétriques", status: "done" },
  { step: 7, title: "Événements et espace organisateurs", status: "done" },
  { step: 8, title: "Communauté locale, espace personnel, suivi GPS", status: "done" },
  { step: 9, title: "Administration locale", status: "done" },
  { step: 10, title: "Tests, sécurité, performance (mise en production : à faire avec l'étape 2)", status: "partial" },
] as const;
