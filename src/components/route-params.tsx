"use client";
import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Explorer } from "./explorer/explorer";
import { Editor } from "./editor/editor";
import { Tracker } from "./tracking/tracker";
import { Library } from "./library/library";
import { RoutePage } from "./route/route-page";
import { EventPage } from "./events/event-page";
import { OrganizerEvent } from "./organizer/organizer-event";
import { validId } from "@/lib/url";

/** Les pages statiques lisent leurs paramètres côté navigateur (hébergement sans serveur). */
function Wrap({ children }: { children: React.ReactNode }) { return <Suspense fallback={<div className="grid min-h-[40vh] place-items-center text-ink-500">Chargement…</div>}>{children}</Suspense>; }

function ExplorerInner() {
  const sp = useSearchParams();
  const lng = Number(sp.get("lng")), lat = Number(sp.get("lat"));
  const ok = sp.get("lng") && sp.get("lat") && Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const initial = useMemo(() => (ok ? { lng, lat } : undefined), [ok, lng, lat]);
  return <Explorer initial={initial} />;
}
export const ExplorerRoute = () => <Wrap><ExplorerInner /></Wrap>;

function EditorInner() { const id = validId(useSearchParams().get("id")); return <Editor routeId={id} />; }
export const EditorRoute = () => <Wrap><EditorInner /></Wrap>;

function TrackerInner() { const id = validId(useSearchParams().get("route")); return <Tracker initialRouteId={id} />; }
export const TrackerRoute = () => <Wrap><TrackerInner /></Wrap>;

function LibraryInner() { return <Library initialSport={useSearchParams().get("sport") ?? undefined} />; }
export const LibraryRoute = () => <Wrap><LibraryInner /></Wrap>;

function RouteInner() { return <RoutePage id={validId(useSearchParams().get("id")) ?? ""} />; }
export const RouteDetailRoute = () => <Wrap><RouteInner /></Wrap>;

function EventInner() { return <EventPage id={validId(useSearchParams().get("id")) ?? ""} />; }
export const EventDetailRoute = () => <Wrap><EventInner /></Wrap>;

function ManageInner() { return <OrganizerEvent id={validId(useSearchParams().get("id")) ?? ""} />; }
export const ManageEventRoute = () => <Wrap><ManageInner /></Wrap>;
