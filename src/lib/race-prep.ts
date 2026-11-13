import type { EventModel, Post, Race } from "./events";
import { clockAt } from "./events";
import { estimateMinutes } from "./sports";
import type { LL } from "./types";

/**
 * Préparation d'une épreuve de trail : tout ce qui se déduit automatiquement de l'événement (courses, postes, bénévoles,
 * effectifs) à partir des recommandations du guide fédéral de l'organisateur de trail fourni par l'utilisateur.
 * Ce guide est ancien : les seuils sportifs restent utiles, mais les délais et obligations administratives ou médicales
 * doivent être vérifiés auprès de la préfecture, de la mairie et de la fédération (voir `PREP_NOTICE`).
 */
export const PREP_NOTICE = "Aide à la préparation établie d'après un guide fédéral de l'organisateur de trail. Ce guide est ancien : délais de déclaration, justificatif médical des coureurs, catégories d'âge et textes cités ont pu changer. Vérifiez chaque point auprès de la préfecture, de la mairie et de la fédération avant de vous y fier.";

export interface Prep {
  participants?: number; spectators?: number; night?: boolean; multiDept?: boolean;
  /** Points cochés à la main (dossier, échéancier). */
  done?: string[];
  /** Budget prévisionnel : montant par poste (€). */
  budget?: Record<string, number>;
  /** Part de goudron mesurée par course (%), et départements traversés. */
  paved?: Record<string, number>; departments?: string[];
  /** Analyse automatique : date du dernier passage, part de chemins et points de rencontre avec une route, par course. */
  analysedAt?: number; offRoad?: Record<string, number>; roads?: Record<string, import("./routing").RoadPoint[]>;
  /** Date de génération des documents et de la logistique proposée. */
  docsAt?: number;
  /** Points validés par l'organisateur (documents officiels, décisions de sécurité). */
  validated?: string[];
}

// ───────────────────────── Nature de l'épreuve ─────────────────────────
export type RaceClass = "nature" | "decouverte" | "trail" | "ultra";
export interface Classification { id: RaceClass; label: string; range: string; maxPavedPct: number; pavedOk: boolean | null; notes: string[] }
const CLASSES: { id: RaceClass; label: string; range: string; minKm: number; maxPaved: number; notes: string[] }[] = [
  { id: "ultra", label: "Ultra-trail", range: "plus de 80 km", minKm: 80, maxPaved: 15, notes: ["Autonomie ou semi-autonomie.", "Heures limites de passage obligatoires, avec mise hors course des concurrents hors délai.", "Dénivelé souhaitable : 2 000 m et plus."] },
  { id: "trail", label: "Trail", range: "plus de 42 km", minKm: 42, maxPaved: 15, notes: ["Autonomie ou semi-autonomie.", "Dénivelé souhaitable : environ 2 000 m."] },
  { id: "decouverte", label: "Trail découverte", range: "de 21 à 42 km", minKm: 21, maxPaved: 25, notes: ["Ravitaillements conseillés, non obligatoires ; les concurrents peuvent emporter le leur."] },
  { id: "nature", label: "Course nature", range: "moins de 21 km", minKm: 0, maxPaved: 25, notes: ["Ravitaillements conseillés, non obligatoires ; les concurrents peuvent emporter le leur."] },
];
/** Nature de l'épreuve selon la distance ; la part de goudron (si mesurée) est comparée au plafond de la catégorie. */
export function classify(distanceKm: number, pavedPct?: number | null): Classification {
  const c = CLASSES.find((x) => distanceKm > x.minKm || (x.id === "decouverte" && distanceKm >= 21)) ?? CLASSES[3];
  return { id: c.id, label: c.label, range: c.range, maxPavedPct: c.maxPaved, pavedOk: pavedPct == null ? null : pavedPct <= c.maxPaved, notes: c.notes };
}

// ───────────────────────── Catégories d'âge ─────────────────────────
export interface AgeCategory { code: string; label: string; ages: string; born: string; maxKm: number | null; allowed: boolean }
const AGES: { code: string; label: string; min: number; max: number; maxKm: number | null }[] = [
  { code: "EA", label: "Éveil athlétique", min: 0, max: 9, maxKm: 1 }, { code: "PO", label: "Poussins", min: 10, max: 11, maxKm: 2 },
  { code: "BE", label: "Benjamins", min: 12, max: 13, maxKm: 3 }, { code: "MI", label: "Minimes", min: 14, max: 15, maxKm: 5 },
  { code: "CA", label: "Cadets", min: 16, max: 17, maxKm: 15 }, { code: "JU", label: "Juniors", min: 18, max: 19, maxKm: 25 },
  { code: "ES", label: "Espoirs", min: 20, max: 22, maxKm: null }, { code: "SE", label: "Seniors", min: 23, max: 39, maxKm: null }, { code: "VE", label: "Vétérans", min: 40, max: 200, maxKm: null },
];
/** Catégories pouvant s'engager sur une distance (distances maximales, à réduire si le dénivelé est important). `year` : année de l'épreuve. */
export function ageCategories(distanceKm: number, year: number): AgeCategory[] {
  return AGES.map((a) => ({
    code: a.code, label: a.label, maxKm: a.maxKm,
    ages: a.min === 0 ? `${a.max} ans et moins` : a.max >= 200 ? `${a.min} ans et plus` : `${a.min}–${a.max} ans`,
    born: a.min === 0 ? `${year - a.max} et après` : a.max >= 200 ? `${year - a.min} et avant` : `${year - a.max} à ${year - a.min}`,
    allowed: a.maxKm == null || (a.code === "EA" ? distanceKm < 1 : distanceKm <= a.maxKm),
  }));
}
export const youngestAllowed = (distanceKm: number, year: number) => ageCategories(distanceKm, year).find((a) => a.allowed)!;

// ───────────────────────── Matériel ─────────────────────────
export function mandatoryGear(distanceKm: number, night: boolean): string[] {
  const g = [distanceKm > 25 ? "Réserve d'eau" : "Au minimum un bidon ou une réserve d'eau", "Barres ou gels énergétiques", "Sifflet", "Blouson de pluie", "Couverture de survie"];
  if (night) g.push("Éclairage (lampe frontale)", "Brassière réfléchissante sur les chemins ouverts à la circulation");
  return g;
}

// ───────────────────────── Dispositif médical ─────────────────────────
export interface MedicalPlan { level: string; items: string[]; team: string[] }
export function medicalPlan(participants: number, maxDistanceKm: number): MedicalPlan {
  const items: string[] = []; let level: string;
  if (participants < 250) { level = "Moins de 250 participants"; items.push("Une équipe de secouristes", "Une liaison radio avec un service d'urgence"); }
  else if (participants <= 500) { level = "De 250 à 500 participants"; items.push("Une ou plusieurs équipes de secouristes", "Une liaison permanente avec un médecin ou un service de secours", "Une ambulance sur place"); }
  else { level = "Plus de 500 participants"; items.push("Au moins un médecin sur place", "Ambulances et secouristes en nombre adapté à l'effectif"); }
  if (maxDistanceKm > 42.195) items.push("Course longue en milieu naturel : liaison radio adaptée au terrain et à la distance", "Présence obligatoire d'au moins un médecin");
  return {
    level, items: [...new Set(items)],
    team: ["Médecin urgentiste (si possible médecin du sport)", "Équipe de secouristes, éventuellement infirmier et kinésithérapeutes", "Local ou tente médicale", "Matériel adapté : secours, oxygénothérapie, défibrillateur portable", "Véhicule médicalisé ou ambulance", "Moyens de communication testés sur tout le parcours (zones sans réseau repérées)", "Hôpital le plus proche repéré et prévenu : lieu, horaires, effectif, accès des secours"],
  };
}

// ───────────────────────── Échéancier ─────────────────────────
export interface Task { id: string; when: string; due: string | null; label: string; detail?: string; indicative?: boolean }
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** Date décalée de `days` jours ou de `months` mois (fin de mois respectée : 31 mai − 3 mois = 28/29 février). */
export function shiftDate(dateISO: string, o: { days?: number; months?: number }): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return null;
  const [y, m, d] = dateISO.split("-").map(Number); const t = new Date(y, m - 1, d);
  if (Number.isNaN(t.getTime())) return null;
  if (o.months) { const day = t.getDate(); t.setDate(1); t.setMonth(t.getMonth() + o.months); t.setDate(Math.min(day, new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate())); }
  if (o.days) t.setDate(t.getDate() + o.days);
  return iso(t);
}
/** Échéancier daté à partir de la date de l'épreuve. Les dates « indicatives » ne figurent pas dans le guide : seul l'ordre y est donné. */
export function timeline(dateISO: string, multiDept: boolean): Task[] {
  const at = (o: { days?: number; months?: number }) => shiftDate(dateISO, o);
  const list: Task[] = [
    { id: "secours", when: "6 mois avant", due: at({ months: -6 }), label: "Retenir l'équipe de secours ou d'assistance médicale", detail: "Un seul interlocuteur pour tout le dispositif médical ; contrat à signer." },
    { id: "budget", when: "6 mois avant", due: at({ months: -6 }), label: "Établir le budget prévisionnel", indicative: true },
    { id: "autorisations", when: "Avant le dépôt du dossier", due: at({ months: -4 }), label: "Obtenir les accords des communes, propriétaires, forestiers et gestionnaires de forêts publiques", detail: "Convention écrite avec chaque propriétaire avant tout balisage. Consulter chasseurs, associations d'environnement et autres usagers. L'administration attend ces avis favorables pour se prononcer.", indicative: true },
    { id: "dossier", when: multiDept ? "3 mois avant (plusieurs départements)" : "6 semaines avant au plus tard (un seul département) — 3 mois conseillés", due: at(multiDept ? { months: -3 } : { days: -42 }), label: "Déposer le dossier administratif en préfecture ou sous-préfecture", detail: "Délais du guide : à confirmer auprès de la préfecture, la procédure a évolué." },
    { id: "services", when: "3 mois avant", due: at({ months: -3 }), label: "Informer police ou gendarmerie, pompiers, SAMU, associations de secours et hôpital le plus proche", detail: "Prévenir aussi chaque commune traversée et le service départemental chargé des sports." },
    { id: "presse", when: "La semaine précédente", due: at({ days: -7 }), label: "Communiquer dans la presse régionale ; affiches et tracts en place" },
    { id: "essais", when: "Avant le jour J", due: at({ days: -3 }), label: "Tester radios et téléphones sur tout le parcours ; reconnaissance complète par les responsables", detail: "Repérer les zones sans réseau.", indicative: true },
    { id: "balisage", when: "Avant le jour J", due: at({ days: -2 }), label: "Baliser le parcours (fléchage sans ambiguïté, marquage au sol biodégradable)", detail: "Kilométrage indiqué à chaque quart du parcours. Une couleur par parcours si possible.", indicative: true },
    { id: "veille", when: "La veille", due: at({ days: -1 }), label: "Réunion technique des responsables ; accueil et retrait des dossards de 16 h à 20 h", detail: "Parcours, départ, arrivée, juges, signaleurs, sécurité et secours, informatique, animation, protocole, bénévoles." },
    { id: "jour", when: "Le jour J", due: at({}), label: "Listes de départ remises à l'animateur et aux médias au moins 1 h avant le départ ; briefing des coureurs sur le site de départ" },
    { id: "debalisage", when: "Dans les 2 jours", due: at({ days: 2 }), label: "Débaliser entièrement le parcours et retirer la signalétique", detail: "Commencer dès le passage du dernier concurrent." },
    { id: "merci", when: "Après la course", due: at({ days: 7 }), label: "Remercier par courrier tous les organismes qui ont contribué à l'épreuve", indicative: true },
  ];
  // ordre chronologique (tri stable : à date égale, l'ordre ci-dessus est gardé)
  return list.map((t, i) => ({ t, i })).sort((a, b) => (a.t.due ?? "").localeCompare(b.t.due ?? "") || a.i - b.i).map((x) => x.t);
}

// ───────────────────────── Horaires du jour J ─────────────────────────
export interface DayStep { clock: string; label: string; estimate?: boolean }
export interface DaySchedule { steps: DayStep[]; firstH: number; lastH: number }
/** Horaires types autour du départ. Arrivées : estimation à partir de la distance et du dénivelé, à ajuster. */
export function raceDay(race: Race): DaySchedule {
  const med = estimateMinutes(race.sport, race.distanceKm * 1000, race.gainM);
  const first = med * 0.55, last = race.maxHours > 0 ? race.maxHours * 60 : med * 1.6;
  const s = race.startTime || "09:00";
  return {
    firstH: first / 60, lastH: last / 60,
    steps: [
      { clock: clockAt(s, -135), label: "Ouverture du retrait des dossards" },
      { clock: clockAt(s, -60), label: "Listes de départ remises à l'animateur et aux médias" },
      { clock: clockAt(s, -15), label: "Dernières consignes aux coureurs (briefing)" },
      { clock: clockAt(s, 0), label: `Départ — ${race.label}` },
      { clock: clockAt(s, first), label: "Arrivée des premiers", estimate: true },
      { clock: clockAt(s, last), label: race.maxHours > 0 ? "Fermeture de l'arrivée (temps limite)" : "Arrivée des derniers", estimate: !(race.maxHours > 0) },
    ],
  };
}

// ───────────────────────── Contrôles sur la logistique saisie ─────────────────────────
export interface Check { level: "ok" | "warn" | "info"; text: string }
export function logisticsChecks(ev: EventModel, race: Race, cls: Classification): Check[] {
  const posts = ev.posts.filter((p) => p.raceId === race.id), out: Check[] = [];
  const of = (k: Post["kind"]) => posts.filter((p) => p.kind === k);
  const staffed = (p: Post) => ev.volunteers.filter((v) => v.postId === p.id).length;
  const sig = of("signaleur"), short = sig.filter((p) => staffed(p) < Math.max(1, p.staffNeeded));
  if (!sig.length) out.push({ level: "warn", text: "Aucun poste de signaleur : il en faut un à chaque traversée de route et carrefour dangereux." });
  else if (short.length) out.push({ level: "warn", text: `${short.length} poste(s) de signaleur sans bénévole en nombre suffisant : ${short.map((p) => p.name || `km ${p.km}`).join(", ")}.` });
  else out.push({ level: "ok", text: `${sig.length} poste(s) de signaleur, tous pourvus.` });
  if (!of("secours").length) out.push({ level: "warn", text: "Aucun poste de secours placé sur le parcours." }); else out.push({ level: "ok", text: `${of("secours").length} poste(s) de secours sur le parcours.` });
  const rav = of("ravito");
  if (rav.length && !rav.some((p) => p.km >= race.distanceKm - 0.5)) out.push({ level: "warn", text: "Pas de ravitaillement à l'arrivée (boissons, eau, solide) : à prévoir." });
  if (rav.length) out.push({ level: "info", text: `${rav.length} ravitaillement(s) : panneau d'entrée 50 m avant la première table, panneau de sortie 50 m après la dernière, jamais dans un virage ; sacs-poubelle et ramassage des déchets par l'équipe du poste.` });
  else if (cls.id === "nature" || cls.id === "decouverte") out.push({ level: "info", text: "Aucun ravitaillement sur le parcours : conseillé mais non obligatoire à cette distance ; annoncez-le aux coureurs." });
  else out.push({ level: "warn", text: "Aucun ravitaillement, pas même à l'arrivée : prévoyez-en un à l'arrivée et précisez dans le règlement que la course est en autonomie complète." });
  const cut = posts.filter((p) => p.cutoffH != null);
  if (cls.id === "ultra" && !cut.length) out.push({ level: "warn", text: "Ultra-trail sans barrière horaire : des heures limites de passage sont obligatoires." });
  else if (cut.length) out.push({ level: "ok", text: `${cut.length} barrière(s) horaire(s) définie(s) : à communiquer aux coureurs.` });
  else if (race.distanceKm > 42) out.push({ level: "info", text: "Aucune barrière horaire : préparez des heures limites aux points stratégiques." });
  if (!of("controle").length) out.push({ level: "info", text: "Aucun point de contrôle intermédiaire : relevez dossard et heure de passage à chaque pointage." });
  if (!race.routeId) out.push({ level: "warn", text: "Aucun parcours lié à cette course : le tracé doit montrer distances, dénivelés et zones de ravitaillement." });
  return out;
}

// ───────────────────────── Dossier administratif ─────────────────────────
export interface FileItem { id: string; label: string; auto: boolean; ok: boolean; detail?: string }
export function adminFile(ev: EventModel, prep: Prep): FileItem[] {
  const n = (k: Post["kind"]) => ev.posts.filter((p) => p.kind === k).length, done = new Set(prep.done ?? []);
  const auto = (id: string, label: string, ok: boolean, detail?: string): FileItem => ({ id, label, auto: true, ok, detail });
  const manual = (id: string, label: string, detail?: string): FileItem => ({ id, label, auto: false, ok: done.has(id), detail });
  const sig = ev.posts.filter((p) => p.kind === "signaleur"), sigNames = ev.volunteers.filter((v) => sig.some((p) => p.id === v.postId));
  return [
    auto("date", "Date et lieu de l'épreuve", Boolean(ev.date && ev.place), ev.date && ev.place ? `${ev.date} · ${ev.place}` : "À saisir dans l'onglet Infos"),
    auto("nature", "Nature de l'épreuve", ev.races.length > 0, ev.races.length ? ev.races.map((r) => `${r.label} : ${classify(r.distanceKm).label}`).join(" · ") : "Ajoutez au moins une course"),
    auto("participants", "Nombre de participants", (prep.participants ?? 0) > 0, prep.participants ? `${prep.participants} attendus` : "À indiquer ci-dessus"),
    auto("spectateurs", "Nombre de spectateurs", prep.spectators != null, prep.spectators != null ? `${prep.spectators} attendus` : "À indiquer ci-dessus"),
    auto("association", "Nom de la structure organisatrice", Boolean(ev.organizer), ev.organizer || "À saisir dans l'onglet Infos"),
    manual("coordonnees", "Coordonnées de l'organisateur (adresse, téléphone, courriel)"),
    auto("reglement", "Règlement de l'épreuve", ev.rules.trim().length > 40, ev.rules.trim().length > 40 ? "Rédigé (onglet Infos)" : "Générez le règlement type ci-dessous"),
    manual("assurance", "Attestation d'assurance en responsabilité civile", "Organisateur, préposés et participants."),
    manual("ordre", "Prise en charge éventuelle du service d'ordre"),
    auto("plan", "Plan précis des parcours", ev.races.length > 0 && ev.races.every((r) => r.routeId), ev.races.every((r) => r.routeId) ? "Carte PDF disponible dans l'onglet Logistique" : "Liez un parcours à chaque course"),
    auto("secours", "Points et accès des secours sur le plan", n("secours") > 0, `${n("secours")} poste(s) de secours placé(s)`),
    auto("ravitos", "Ravitaillements sur le plan", n("ravito") + n("eau") > 0, `${n("ravito")} ravitaillement(s), ${n("eau")} point(s) d'eau`),
    manual("communication", "Moyens de communication (radios, téléphones, relais)"),
    manual("securite", "Description des moyens de sécurité et du dispositif médical", "Reprenez la section « Dispositif médical » ci-dessus."),
    auto("zones", "Descriptif des zones de départ et d'arrivée", n("depart") > 0 && n("arrivee") > 0, n("depart") && n("arrivee") ? "Postes Départ et Arrivée placés" : "Placez les postes Départ et Arrivée (onglet Logistique)"),
    manual("structures", "Structures temporaires (barnums) : matériaux, capacité, usage", "Cochez aussi si aucune structure n'est prévue."),
    manual("evacuation", "Moyens d'accès au parcours et itinéraires d'évacuation"),
    auto("signaleurs", "Sécurisation des traversées de routes : liste des signaleurs", sig.length > 0 && sigNames.length >= sig.length, sig.length ? `${sig.length} poste(s), ${sigNames.length} signaleur(s) nommé(s)${sigNames.length ? " : " + sigNames.map((v) => v.name).join(", ") : ""}. Ajoutez âge et numéro de permis de conduire de chacun.` : "Placez les postes de signaleur (onglet Logistique)"),
  ];
}

// ───────────────────────── Budget ─────────────────────────
export const BUDGET_LINES: { id: string; label: string }[] = [
  { id: "medical", label: "Dispositif médical" }, { id: "securite", label: "Sécurité" }, { id: "parcours", label: "Préparation et balisage du parcours" },
  { id: "dossards", label: "Dossards" }, { id: "chrono", label: "Chronométrage" }, { id: "recompenses", label: "Récompenses" }, { id: "imprimes", label: "Imprimés" },
  { id: "zones", label: "Aménagement des zones de départ et d'arrivée" }, { id: "ravitos", label: "Ravitaillements" }, { id: "communication", label: "Supports de communication" },
  { id: "receptions", label: "Réceptions et accueil des invités" }, { id: "assurance", label: "Assurance" }, { id: "autres", label: "Autres dépenses" },
];
export const budgetTotal = (b: Record<string, number> | undefined) => BUDGET_LINES.reduce((s, l) => s + (Number(b?.[l.id]) || 0), 0);

// ───────────────────────── Signalétique du site ─────────────────────────
export const SITE_SIGNS = ["Accès au site depuis l'entrée de la commune", "Accueil", "Vestiaires", "Retrait des dossards (un comptoir par course)", "Zone de départ", "Affichage des résultats", "Poste médical", "Contrôle antidopage", "Salle de presse", "Douches", "Parkings (officiels, bénévoles, presse, coureurs, spectateurs)"];
export const EMERGENCY_NUMBERS: [string, string][] = [["15", "SAMU"], ["18", "Pompiers"], ["17", "Police / gendarmerie"], ["112", "Numéro d'urgence européen"]];
export const EMERGENCY_PROCEDURE = ["Le témoin prévient le premier membre de l'organisation rencontré.", "Celui-ci transmet au poste de contrôle puis au responsable de course : lieu précis, description des blessures ou du malaise, âge du participant.", "Le responsable de course organise les secours avec le médecin responsable.", "Deux réseaux de liaison distincts sont conseillés : un pour les secours, un pour l'organisation."];

// ───────────────────────── Règlement type ─────────────────────────
const frDate = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "date à préciser");
/** Projet de règlement à relire et compléter : rédigé à partir des données de l'événement et des recommandations du guide. */
export function rulesDraft(ev: EventModel, prep: Prep): string {
  const year = /^\d{4}/.test(ev.date) ? +ev.date.slice(0, 4) : new Date().getFullYear(), L: string[] = [];
  L.push(`RÈGLEMENT — ${ev.name || "Épreuve"}`, `${frDate(ev.date)}${ev.place ? ` — ${ev.place}` : ""}. Organisation : ${ev.organizer || "à préciser"}.`, "");
  L.push("1. Épreuves");
  for (const r of ev.races) {
    const c = classify(r.distanceKm, prep.paved?.[r.id]), y = youngestAllowed(r.distanceKm, year);
    L.push(`- ${r.label} : ${String(r.distanceKm).replace(".", ",")} km, ${Math.round(r.gainM)} m de dénivelé positif (${c.label.toLowerCase()}). Départ à ${r.startTime || "heure à préciser"}${r.maxHours > 0 ? `, temps limite ${String(r.maxHours).replace(".", ",")} h` : ""}. Ouverte à partir de la catégorie ${y.label.toLowerCase()} (nés en ${y.born}).`);
  }
  if (!ev.races.length) L.push("- Courses à préciser.");
  L.push("", "2. Inscription", "- Chaque coureur signe son bulletin d'inscription et accepte le présent règlement.", "- Justificatif médical ou licence : selon la réglementation fédérale en vigueur à la date de l'épreuve [à compléter].", "- Une assurance individuelle accident est recommandée.", ev.registrationUrl ? `- Inscriptions : ${ev.registrationUrl}` : "- Modalités et droits d'inscription : [à compléter].");
  L.push("", "3. Matériel");
  for (const r of ev.races) L.push(`- ${r.label} : ${mandatoryGear(r.distanceKm, !!prep.night).join(", ").toLowerCase()}.`);
  L.push("- Usage des bâtons : [autorisé / interdit — à préciser].");
  L.push("", "4. Déroulement", "- Le parcours est balisé ; les coureurs suivent le balisage et passent par tous les points de contrôle.");
  const cut = ev.posts.filter((p) => p.cutoffH != null);
  for (const p of cut) { const r = ev.races.find((x) => x.id === p.raceId); if (r) L.push(`- Barrière horaire — ${r.label}, ${p.name || `km ${p.km}`} (km ${String(p.km).replace(".", ",")}) : ${clockAt(r.startTime || "09:00", (p.cutoffH ?? 0) * 60)}. Passé ce délai, le dossard est retiré.`); }
  L.push("- Les ravitaillements hors des zones prévues et toute assistance personnelle sur le parcours sont interdits.", "- Les accompagnateurs à vélo ne sont pas autorisés.", "- Tout abandon est signalé au poste de contrôle le plus proche, où le dossard est remis.", "- Les coureurs se doivent secours et entraide ; tout accident est signalé immédiatement au poste le plus proche.");
  L.push("", "5. Respect du milieu et des riverains", "- Aucun déchet n'est laissé sur le parcours ; les zones interdites et les passages obligatoires sont respectés.", "- Ne pas couper à travers champs, cultures ou propriétés ; refermer portes et barrières.", "- Respecter la faune, la flore et les autres usagers : chasseurs, forestiers, promeneurs.", "- Tout manquement à ces règles peut entraîner la mise hors course.");
  L.push("", "6. Classements et récompenses", "- Classement scratch et par catégorie, hommes et femmes.", "- Récompenses : [à compléter].");
  L.push("", "7. Responsabilité, image et données", "- L'organisateur est assuré en responsabilité civile. Les coureurs participent sous leur propre responsabilité.", "- Droit à l'image : [mention à compléter].", "- Données personnelles : [mention à compléter, conformément à la réglementation sur la protection des données].", "- Lutte contre le dopage : les participants s'engagent à respecter les règles en vigueur et à se soumettre aux contrôles.");
  L.push("", "Projet généré automatiquement : à relire, compléter et faire valider avant diffusion.");
  return L.join("\n");
}

// ───────────────────────── Départements traversés ─────────────────────────
/** Départements traversés par un tracé : échantillon de points, parcelle cadastrale la plus proche (géocodage inverse de la Géoplateforme, qui couvre aussi la montagne). `null` si le service ne répond pas. */
export async function departmentsAlong(line: LL[], signal?: AbortSignal): Promise<string[] | null> {
  if (line.length < 2) return [];
  const n = Math.min(12, line.length), pts = Array.from({ length: n }, (_, i) => line[Math.round((i * (line.length - 1)) / (n - 1))]), out = new Set<string>(); let answered = 0;
  for (let i = 0; i < pts.length; i += 4) { // 4 requêtes à la fois : sous la limite de cadence du service
    await Promise.all(pts.slice(i, i + 4).map(async (p) => {
      try {
        const r = await fetch(`https://data.geopf.fr/geocodage/reverse?lon=${p[0].toFixed(5)}&lat=${p[1].toFixed(5)}&limit=1&index=parcel`, { signal });
        if (!r.ok) return; answered++;
        const j = (await r.json()) as { features?: { properties?: { departmentcode?: string } }[] }; const d = j.features?.[0]?.properties?.departmentcode; if (d) out.add(d);
      } catch { /* point ignoré */ }
    }));
  }
  return answered ? [...out].sort() : null;
}

// ───────────────────────── Dossier complet (texte, pour le PDF) ─────────────────────────
export interface ReportSection { title: string; lines: string[] }
export function prepReport(ev: EventModel, prep: Prep): ReportSection[] {
  const year = /^\d{4}/.test(ev.date) ? +ev.date.slice(0, 4) : new Date().getFullYear(), out: ReportSection[] = [];
  const maxKm = Math.max(0, ...ev.races.map((r) => r.distanceKm));
  for (const r of ev.races) {
    const c = classify(r.distanceKm, prep.paved?.[r.id]), d = raceDay(r);
    out.push({ title: `${r.label} — ${String(r.distanceKm).replace(".", ",")} km, ${Math.round(r.gainM)} m D+`, lines: [
      `Nature : ${c.label} (${c.range}) ; goudron ${c.maxPavedPct} % au plus${prep.paved?.[r.id] != null ? ` — mesuré : ${Math.round(prep.paved[r.id])} % (${c.pavedOk ? "conforme" : "au-dessus du plafond"})` : " — part de goudron non mesurée"}.`,
      ...c.notes, `Catégories admises : à partir de ${youngestAllowed(r.distanceKm, year).label.toLowerCase()} (nés en ${youngestAllowed(r.distanceKm, year).born}) ; distances maximales à réduire si le dénivelé est important.`,
      `Matériel : ${mandatoryGear(r.distanceKm, !!prep.night).join(", ")}.`,
      "Horaires : " + d.steps.map((s) => `${s.clock} ${s.label}${s.estimate ? " (estimation)" : ""}`).join(" · "),
      ...logisticsChecks(ev, r, c).map((k) => `${k.level === "warn" ? "À traiter" : k.level === "ok" ? "OK" : "Note"} : ${k.text}`),
    ] });
  }
  if (prep.participants) { const m = medicalPlan(prep.participants, maxKm); out.push({ title: `Dispositif médical — ${m.level}`, lines: [...m.items, "Composition conseillée de l'équipe : " + m.team.join(" ; ") + "."] }); }
  out.push({ title: "Échéancier", lines: timeline(ev.date, !!prep.multiDept).map((t) => `${t.due ? frDate(t.due) : t.when}${t.indicative ? " (indicatif)" : ""} — ${t.label}${(prep.done ?? []).includes(`t:${t.id}`) ? " [fait]" : ""}`) });
  out.push({ title: "Dossier administratif", lines: adminFile(ev, prep).map((f) => `[${f.ok ? "x" : " "}] ${f.label}${f.detail ? ` — ${f.detail}` : ""}`) });
  if (budgetTotal(prep.budget) > 0) out.push({ title: "Budget prévisionnel", lines: [...BUDGET_LINES.filter((l) => prep.budget?.[l.id]).map((l) => `${l.label} : ${prep.budget![l.id]} €`), `Total : ${budgetTotal(prep.budget)} €`] });
  out.push({ title: "Affichage d'urgence (départ, arrivée, accueil)", lines: [EMERGENCY_NUMBERS.map(([n, l]) => `${n} ${l}`).join(" · ") + " · médecin de garde : [numéro]", ...EMERGENCY_PROCEDURE] });
  out.push({ title: "Signalétique du site", lines: [SITE_SIGNS.join(" · ")] });
  return out;
}
