import type { EventModel } from "./events";

/** Courses d'événements qui s'appuient sur ces parcours : à signaler avant de supprimer. */
export function racesUsing(events: Pick<EventModel, "name" | "races">[], ids: string[]): string[] {
  return events.flatMap((e) => e.races.filter((r) => r.routeId && ids.includes(r.routeId)).map((r) => `${r.label} (${e.name})`));
}
/** Texte de confirmation : ce qui sera supprimé, et ce qui en dépend. */
export function deleteMessage(names: string[], used: string[]): string {
  const what = names.length === 1 ? `Supprimer le parcours « ${names[0]} » ?` : `Supprimer ces ${names.length} parcours ?\n\n${names.slice(0, 12).map((n) => `• ${n}`).join("\n")}${names.length > 12 ? `\n… et ${names.length - 12} autre(s)` : ""}`;
  return `${what}\n\nLa suppression est définitive sur cet appareil. Exportez d'abord en GPX ce que vous voulez garder.${used.length ? `\n\nAttention : ${used.length === 1 ? "une course s'appuie" : `${used.length} courses s'appuient`} sur ${names.length === 1 ? "ce parcours" : "ces parcours"} : ${used.slice(0, 6).join(", ")}. Il faudra leur choisir un autre parcours.` : ""}`;
}
