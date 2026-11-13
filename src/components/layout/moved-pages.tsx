"use client";
import { Moved } from "./moved";

const okId = (v: string | null) => (v && /^[\w-]{2,60}$/.test(v) ? v : "");
/** Les itinéraires de référence sont désormais un onglet de l'Explorer. */
export const MovedItineraires = () => <Moved title="Itinéraires de référence" text="Les itinéraires sont maintenant dans l'Explorer : redirection…" to={(q) => `/explorer/?itineraire=${okId(q.get("id"))}`} />;
/** L'itinérance se calcule depuis la fiche de chaque parcours. */
export const MovedItinerance = () => <Moved title="Itinérance" text="L'itinérance se prépare maintenant depuis la fiche de chaque parcours : redirection…" to={(q) => (okId(q.get("id")) ? `/parcours/voir/?id=${okId(q.get("id"))}#itinerance` : "/parcours/")} />;
