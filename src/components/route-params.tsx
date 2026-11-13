"use client";
import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { EventsList } from "@/components/events/events-list";
import { Explorer } from "./explorer/explorer";
import { Editor } from "./editor/editor";
import { Library } from "./library/library";
import { RoutePage } from "./route/route-page";
import { EventPage } from "./events/event-page";
import { OrganizerEvent } from "./organizer/organizer-event";
import { CollectionPage } from "./collections/collection-page";
import { OwnerPageView } from "./collections/owner-page";
import { validId } from "@/lib/url";

/** Les pages statiques lisent leurs paramètres côté navigateur (hébergement sans serveur). */
function Wrap({ children }: { children: React.ReactNode }) { return <Suspense fallback={<div className="grid min-h-[40vh] place-items-center text-ink-500">Chargement…</div>}>{children}</Suspense>; }

function ExplorerInner() {
  const sp = useSearchParams();
  const lng = Number(sp.get("lng")), lat = Number(sp.get("lat"));
  const ok = sp.get("lng") && sp.get("lat") && Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const initial = useMemo(() => (ok ? { lng, lat } : undefined), [ok, lng, lat]);
  const ref = sp.get("itineraire"), initialRef = sp.has("itineraire") ? (ref && /^[\w-]{2,60}$/.test(ref) ? ref : "") : null;
  return <Explorer initial={initial} initialRef={initialRef} />;
}
export const ExplorerRoute = () => <Wrap><ExplorerInner /></Wrap>;

function EditorInner() { const id = validId(useSearchParams().get("id")); return <Editor routeId={id} />; }
export const EditorRoute = () => <Wrap><EditorInner /></Wrap>;


function LibraryInner() { return <Library initialSport={useSearchParams().get("sport") ?? undefined} />; }
function EventsInner() { return <EventsList initialSport={useSearchParams().get("sport") ?? undefined} />; }
export const EventsRoute = () => <Wrap><EventsInner /></Wrap>;
export const LibraryRoute = () => <Wrap><LibraryInner /></Wrap>;

function RouteInner() { return <RoutePage id={validId(useSearchParams().get("id")) ?? ""} />; }
export const RouteDetailRoute = () => <Wrap><RouteInner /></Wrap>;

function EventInner() { return <EventPage id={validId(useSearchParams().get("id")) ?? ""} />; }
export const EventDetailRoute = () => <Wrap><EventInner /></Wrap>;

function CollectionInner() { return <CollectionPage id={validId(useSearchParams().get("id")) ?? ""} />; }
export const CollectionRoute = () => <Wrap><CollectionInner /></Wrap>;

function OwnerInner() { const id = useSearchParams().get("id"); return <OwnerPageView id={id === "me" ? "me" : validId(id) ?? ""} />; }
export const OwnerRoute = () => <Wrap><OwnerInner /></Wrap>;

function ManageInner() { return <OrganizerEvent id={validId(useSearchParams().get("id")) ?? ""} />; }
export const ManageEventRoute = () => <Wrap><ManageInner /></Wrap>;
