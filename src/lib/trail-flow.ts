import type { EventModel } from "./events";
import { volunteersAt } from "./events";
import { adminFile, classify, timeline, type Prep } from "./race-prep";

/**
 * Parcours guidé de l'organisation d'un trail : six étapes qui s'enchaînent, chacune ouvrant la suivante.
 * Tout est déduit des données de l'événement : aucun état d'avancement n'est saisi à la main, sauf les validations
 * humaines (documents officiels, décisions de sécurité), qui ne peuvent pas être automatisées.
 */
export type StepId = "parcours" | "trail" | "analyse" | "documents" | "logistique" | "verification";
export type ItemState = "done" | "todo" | "validate" | "optional";
export interface FlowItem { id: string; step: StepId; label: string; state: ItemState; hint?: string; /** validation humaine : identifiant à cocher */ validateId?: string }
export interface FlowStep { id: StepId; n: number; title: string; short: string; goal: string; status: "locked" | "todo" | "progress" | "done"; lockedWhy?: string; items: FlowItem[]; done: number; total: number }
export interface Flow { steps: FlowStep[]; current: StepId; percent: number; todo: FlowItem[]; toValidate: FlowItem[]; done: FlowItem[] }

export const STEP_META: { id: StepId; title: string; short: string; goal: string }[] = [
  { id: "parcours", title: "Parcours", short: "Parcours", goal: "Tracez ou importez le parcours de chaque course et enregistrez-le." },
  { id: "trail", title: "Votre trail", short: "Trail", goal: "Décrivez l'événement et associez un parcours à chaque course." },
  { id: "analyse", title: "Analyse", short: "Analyse", goal: "Le site lit vos parcours : nature des épreuves, routes traversées, départements, dispositif médical." },
  { id: "documents", title: "Documents", short: "Documents", goal: "Règlement, dossier administratif, échéancier et fiches sont préparés à partir de l'analyse." },
  { id: "logistique", title: "Logistique", short: "Logistique", goal: "Postes, ravitaillements, secours, signaleurs et bénévoles sur la carte." },
  { id: "verification", title: "Vérification finale", short: "Vérification", goal: "Ce qui est prêt, ce qui reste à compléter et ce que vous devez valider vous-même." },
];
/** Validations qui restent humaines : le site prépare, l'organisateur décide. */
export const VALIDATIONS: { id: string; step: StepId; label: string; hint: string }[] = [
  { id: "v:reglement", step: "documents", label: "Règlement relu et validé", hint: "Complétez les mentions entre crochets et faites-le relire avant diffusion." },
  { id: "v:dossier", step: "documents", label: "Dossier administratif vérifié avant dépôt", hint: "Délais et pièces à confirmer auprès de la préfecture ou de la mairie." },
  { id: "v:medical", step: "logistique", label: "Dispositif de secours validé avec le responsable médical", hint: "Le site propose un dispositif ; la décision appartient au médecin ou à l'association de secours." },
  { id: "v:signaleurs", step: "logistique", label: "Traversées de routes vérifiées sur le terrain", hint: "Les traversées sont détectées sur la carte : confirmez chacune sur place et ajoutez celles qui manquent." },
  { id: "v:autorisations", step: "logistique", label: "Accords des propriétaires et des communes obtenus", hint: "Convention écrite avec chaque propriétaire avant tout balisage." },
];

const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

export function trailFlow(ev: EventModel, routeIds: string[], today: string): Flow {
  const prep: Prep = ev.prep ?? {}, has = (id: string) => (prep.validated ?? []).includes(id);
  const linked = ev.races.filter((r) => r.routeId && routeIds.includes(r.routeId)), allLinked = ev.races.length > 0 && linked.length === ev.races.length;
  const item = (step: StepId, id: string, label: string, ok: boolean, hint?: string, optional = false): FlowItem => ({ id, step, label, state: ok ? "done" : optional ? "optional" : "todo", hint: ok ? undefined : hint });
  const val = (id: string, ready: boolean): FlowItem => { const v = VALIDATIONS.find((x) => x.id === id)!; return { id, step: v.step, label: v.label, state: has(id) ? "done" : ready ? "validate" : "todo", hint: has(id) ? undefined : v.hint, validateId: id }; };
  const kinds = (k: string) => ev.posts.filter((p) => p.kind === k);
  const staffed = ev.posts.filter((p) => p.staffNeeded > 0), covered = staffed.filter((p) => volunteersAt(ev, p.id).length >= p.staffNeeded).length;
  const autoLeft = ev.posts.filter((p) => p.auto).length;
  const file = adminFile(ev, prep), fileOk = file.filter((f) => f.ok).length;
  const late = isDate(ev.date) ? timeline(ev.date, !!prep.multiDept).filter((t) => t.due && t.due < today && t.due < ev.date && !(prep.done ?? []).includes(`t:${t.id}`)).length : 0;
  const pavedBad = linked.filter((r) => { const p = prep.paved?.[r.id]; return p != null && !classify(r.distanceKm, p).pavedOk; });
  const ultraNoCut = linked.filter((r) => classify(r.distanceKm).id === "ultra" && !ev.posts.some((p) => p.raceId === r.id && p.cutoffH != null));

  const items: Record<StepId, FlowItem[]> = {
    parcours: [item("parcours", "p:route", "Au moins un parcours enregistré", routeIds.length > 0 || linked.length > 0, "Créez un parcours dans l'éditeur ou importez un fichier GPX.")],
    trail: [
      item("trail", "t:infos", "Nom, date, lieu et organisateur", Boolean(ev.name && isDate(ev.date) && ev.place && ev.organizer), "Renseignez les informations de l'événement."),
      item("trail", "t:course", "Au moins une course", ev.races.length > 0, "Ajoutez une course en choisissant son parcours."),
      item("trail", "t:liees", "Chaque course a son parcours", allLinked, ev.races.length ? "Une course n'a pas ou plus de parcours : choisissez-en un." : undefined),
      item("trail", "t:effectif", "Nombre de participants attendus", (prep.participants ?? 0) > 0, "Il dimensionne les secours et le dossier administratif."),
    ],
    analyse: [
      item("analyse", "a:lancee", "Analyse des parcours lancée", !!prep.analysedAt, "Un clic : le site mesure goudron, routes traversées et départements."),
      item("analyse", "a:goudron", "Part de goudron mesurée sur chaque parcours", linked.length > 0 && linked.every((r) => prep.paved?.[r.id] != null), "Le service de calcul n'a pas répondu pour tous les parcours : relancez l'analyse."),
      item("analyse", "a:routes", "Traversées de routes repérées", linked.length > 0 && linked.every((r) => prep.roads?.[r.id] != null), "Relancez l'analyse pour repérer les traversées."),
      item("analyse", "a:departements", "Départements traversés identifiés", (prep.departments?.length ?? 0) > 0, "Ils fixent le délai de dépôt du dossier."),
      // constat mesuré : le site ne tranche pas, l'organisateur décide (modifier le parcours ou annoncer l'épreuve autrement)
      ...(pavedBad.length ? [{ id: "v:plafond", step: "analyse" as StepId, validateId: "v:plafond", label: `Trop de goudron pour la catégorie (${pavedBad.map((r) => `${r.label} : ${prep.paved![r.id]} %`).join(", ")}) : décision prise`, state: (has("v:plafond") ? "done" : "validate") as ItemState, hint: has("v:plafond") ? undefined : "Modifiez le parcours, ou annoncez l'épreuve sans cette appellation ; cochez quand c'est décidé." }] : []),
    ],
    documents: [
      item("documents", "d:generes", "Documents générés", !!prep.docsAt, "Un clic : règlement, dossier, échéancier et logistique proposée."),
      item("documents", "d:reglement", "Règlement rédigé", ev.rules.trim().length > 40, "Il est généré à partir de vos courses."),
      val("v:reglement", ev.rules.trim().length > 40),
      item("documents", "d:dossier", `Dossier administratif : ${fileOk} pièce(s) prête(s) sur ${file.length}`, fileOk === file.length, "Complétez les pièces signalées dans l'étape Documents."),
      val("v:dossier", fileOk >= file.length - 3),
      item("documents", "d:echeancier", late ? `Échéancier : ${late} échéance(s) dépassée(s)` : "Échéancier à jour", late === 0, "Cochez les étapes faites ou traitez celles en retard."),
    ],
    logistique: [
      item("logistique", "l:depart", "Départ et arrivée placés", kinds("depart").length > 0 && kinds("arrivee").length > 0, "Placez-les sur la carte ou utilisez la proposition automatique."),
      item("logistique", "l:ravito", "Ravitaillements placés", kinds("ravito").length > 0, "Au moins un à l'arrivée."),
      item("logistique", "l:secours", "Postes de secours placés", kinds("secours").length > 0),
      item("logistique", "l:signaleurs", "Signaleurs placés aux traversées de routes", kinds("signaleur").length > 0 || (!!prep.analysedAt && linked.every((r) => (prep.roads?.[r.id]?.length ?? 1) === 0)), "Un signaleur à chaque traversée ou carrefour dangereux."),
      ...(ultraNoCut.length ? [item("logistique", "l:barrieres", `Barrières horaires (obligatoires en ultra) : ${ultraNoCut.map((r) => r.label).join(", ")}`, false, "Indiquez une heure limite sur au moins un poste.")] : []),
      item("logistique", "l:proposes", autoLeft ? `${autoLeft} poste(s) proposé(s) à vérifier` : "Postes proposés vérifiés", autoLeft === 0, "Ouvrez chaque poste proposé, ajustez-le puis confirmez-le."),
      item("logistique", "l:benevoles", staffed.length ? `Bénévoles : ${covered} poste(s) pourvu(s) sur ${staffed.length}` : "Bénévoles affectés aux postes", staffed.length > 0 && covered === staffed.length, "Affectez les bénévoles depuis la carte ou depuis leurs fiches."),
      val("v:medical", kinds("secours").length > 0), val("v:signaleurs", kinds("signaleur").length > 0), val("v:autorisations", !!prep.analysedAt),
    ],
    verification: [],
  };
  // chaque étape ouvre la suivante
  const gate: Record<StepId, string | undefined> = {
    parcours: undefined,
    trail: routeIds.length > 0 || linked.length > 0 ? undefined : "Enregistrez d'abord un parcours.",
    analyse: !ev.races.length ? "Ajoutez d'abord une course à votre trail." : !allLinked ? "Associez un parcours à chaque course." : !(prep.participants ?? 0) ? "Indiquez le nombre de participants attendus." : undefined,
    documents: prep.analysedAt ? undefined : "Lancez d'abord l'analyse des parcours.",
    logistique: prep.docsAt ? undefined : "Générez d'abord les documents.",
    verification: ev.posts.length ? undefined : "Placez d'abord les postes de la logistique.",
  };
  // événement déjà préparé avant l'existence du parcours guidé (postes ou bénévoles saisis) : rien de ce qui existe n'est verrouillé
  if (ev.posts.length > 0 || ev.volunteers.length > 0) { gate.documents = undefined; gate.logistique = undefined; gate.verification = undefined; if (ev.races.length) gate.analyse = undefined; }
  let blocked: string | undefined; const steps: FlowStep[] = [];
  STEP_META.forEach((m, i) => {
    blocked = blocked ?? gate[m.id];
    let its = items[m.id];
    if (m.id === "verification") its = steps.flatMap((s) => s.items.filter((x) => x.state !== "done" && x.state !== "optional"));
    const counted = m.id === "verification" ? steps.flatMap((s) => s.items).filter((x) => x.state !== "optional") : its.filter((x) => x.state !== "optional"), done = counted.filter((x) => x.state === "done").length;
    steps.push({ ...m, n: i + 1, items: its, done, total: counted.length, lockedWhy: blocked, status: blocked ? "locked" : done === counted.length ? "done" : done > 0 || m.id === "verification" ? "progress" : "todo" });
  });
  const all = steps.slice(0, 5).flatMap((s) => s.items).filter((x) => x.state !== "optional");
  const current = (steps.find((s) => s.status !== "done" && s.status !== "locked") ?? [...steps].reverse().find((s) => s.status !== "locked") ?? steps[0]).id;
  return { steps, current, percent: all.length ? Math.round((100 * all.filter((x) => x.state === "done").length) / all.length) : 0, todo: all.filter((x) => x.state === "todo"), toValidate: all.filter((x) => x.state === "validate"), done: all.filter((x) => x.state === "done") };
}
