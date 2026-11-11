"use client";
import { useMemo } from "react";
import { LocateFixed, Loader2 } from "lucide-react";
import { useAllRoutes } from "@/lib/route-vm";
import { haversine } from "@/lib/geo";
import { RouteCard } from "@/components/ui/route-card";
import { Button } from "@/components/ui/button";
import { useGeo } from "./geo-context";

export function NearYou() {
  const { pos, status, request } = useGeo();
  const all = useAllRoutes();
  const sorted = useMemo(() => {
    if (!pos) return [];
    return all.map((r) => ({ r, d: haversine([pos.lng, pos.lat], r.coords[0]) })).sort((a, b) => a.d - b.d).slice(0, 3);
  }, [pos, all]);

  if (!pos) {
    return (
      <div className="flex flex-col items-start gap-4 rounded-[var(--radius-card)] border border-dashed border-ink-200 bg-white p-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold">Parcours proches de vous</h3>
          <p className="mt-1 max-w-xl text-sm text-ink-500">Partagez votre position (uniquement dans votre navigateur, elle n'est pas enregistrée) pour classer vos parcours enregistrés par distance.</p>
          {status === "error" && <p className="mt-2 text-sm text-danger" role="alert">Position indisponible ou refusée.</p>}
        </div>
        <Button onClick={() => request()} disabled={status === "loading"} variant="brand">
          {status === "loading" ? <Loader2 className="size-4 animate-spin" /> : <LocateFixed className="size-4" />}Utiliser ma position
        </Button>
      </div>
    );
  }
  if (!sorted.length) return <p className="rounded-[var(--radius-card)] border border-dashed border-ink-200 bg-white p-8 text-sm text-ink-500">Vous n'avez pas encore de parcours enregistré. Créez-en un, importez un GPX ou ajoutez un itinéraire de référence à votre bibliothèque.</p>;
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {sorted.map(({ r, d }) => <RouteCard key={r.id} route={r} note={`à ${Math.round(d / 1000).toLocaleString("fr-FR")} km`} />)}
    </div>
  );
}
