export const SITE = { name: "Crête", tagline: "Tracer. Explorer. Courir. Partager." };

export const NAV = [
  { href: "/explorer", label: "Explorer" },
  { href: "/creer", label: "Créer un parcours" },
  { href: "/parcours", label: "Parcours" },
  { href: "/evenements", label: "Événements" },
  { href: "/organisateurs", label: "Organisateurs" },
  { href: "/communaute", label: "Communauté" },
  { href: "/tarifs", label: "Tarifs" },
] as const;

/** Feuille de route : source unique pour les pages « en développement ». */
export const MODULES: Record<string, { step: number; title: string; summary: string; items: string[] }> = {
  evenements: { step: 7, title: "Calendrier des événements", summary: "Calendrier sportif avec formats de course, règlement, cartographie et liens d'inscription.", items: ["Recherche par date, sport, région, distance", "Plusieurs formats par événement", "Parcours détaillés"] },
  organisateurs: { step: 7, title: "Espace organisateurs", summary: "Outils logistiques : ravitaillements, barrières horaires, bénévoles, secours, exports PDF.", items: ["Points de contrôle et barrières", "Fiches bénévoles", "Temps de passage", "Rôles et permissions"] },
  communaute: { step: 8, title: "Communauté", summary: "Profils sportifs, abonnements, collections, challenges et classements.", items: ["Profils et abonnements", "Collections", "Challenges et classements"] },
  connexion: { step: 2, title: "Connexion et inscription", summary: "Authentification et base de données (Supabase / PostgreSQL + PostGIS).", items: ["Compte e-mail", "Row Level Security", "Confidentialité des traces"] },
  compte: { step: 2, title: "Espace personnel", summary: "Tableau de bord : parcours, favoris, activités, statistiques, fichiers GPS.", items: ["Mes parcours et favoris", "Mes fichiers GPS", "Mes statistiques"] },
  admin: { step: 9, title: "Administration", summary: "Back-office : membres, modération, signalements, abonnements, contenus éditoriaux.", items: ["Modération", "Signalements", "Statistiques"] },
  mobile: { step: 8, title: "Navigation mobile", summary: "Suivi GPS, alertes de sortie de parcours, cartes hors ligne.", items: ["Géolocalisation continue", "Hors ligne selon licences"] },
};

export const ROADMAP = [
  { step: 1, title: "Identité visuelle et interface", status: "done" },
  { step: 2, title: "Authentification et base de données", status: "deferred" },
  { step: 3, title: "Cartographie interactive", status: "done" },
  { step: 4, title: "Éditeur de parcours GPS", status: "todo" },
  { step: 5, title: "Import et export GPS", status: "todo" },
  { step: 6, title: "Fiches parcours et profils altimétriques", status: "todo" },
  { step: 7, title: "Événements et espace organisateurs", status: "todo" },
  { step: 8, title: "Communauté et abonnements", status: "todo" },
  { step: 9, title: "Administration", status: "todo" },
  { step: 10, title: "Tests, sécurité, performance, production", status: "todo" },
] as const;
