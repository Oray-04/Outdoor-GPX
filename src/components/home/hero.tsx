"use client";
import { useRef, useState, type FormEvent } from "react";
import { Search, LocateFixed, Loader2, Route as RouteIcon, Compass } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TopoPattern } from "@/components/ui/route-card";
import { HeroMap, type HeroMapHandle } from "./hero-map";
import { geocode } from "@/lib/geocode";
import { useGeo } from "./geo-context";

export function Hero() {
  const map = useRef<HeroMapHandle>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const geo = useGeo();

  async function search(e: FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const hit = await geocode(q);
      if (!hit) setMsg("Aucun lieu trouvé. Essayez une autre orthographe.");
      else { map.current?.flyTo(hit.lng, hit.lat, hit.zoom); setMsg(hit.label); }
    } catch {
      setMsg("Recherche indisponible pour le moment. Réessayez dans un instant.");
    } finally { setBusy(false); }
  }

  function locate() {
    setMsg(null);
    geo.request((p) => { map.current?.flyTo(p.lng, p.lat, 10); map.current?.setUserPos(p.lng, p.lat); }, (m) => setMsg(m));
  }

  return (
    <section className="relative isolate overflow-hidden bg-ink-900 text-white">
      <TopoPattern className="!opacity-[0.07] scale-150" />
      <div className="absolute -left-32 top-0 -z-10 size-[28rem] rounded-full bg-pine-600/30 blur-3xl" />
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:py-20">
        <div>
          <Badge tone="dark" className="rise"><Compass className="size-3.5" />Plateforme outdoor indépendante</Badge>
          <h1 className="rise rise-2 mt-5 text-4xl font-extrabold leading-[1.05] sm:text-5xl lg:text-6xl">
            Chaque sortie commence par <span className="text-ember-400">une trace</span>.
          </h1>
          <p className="rise rise-3 mt-5 max-w-xl text-lg leading-relaxed text-ink-200">
            Créez vos itinéraires, explorez des parcours de trail, de randonnée et de vélo, et préparez vos événements avec des outils de cartographie pensés pour le terrain.
          </p>

          <form onSubmit={search} role="search" className="rise rise-3 mt-8 flex max-w-xl flex-col gap-2 sm:flex-row">
            <label className="relative flex-1">
              <span className="sr-only">Rechercher un lieu</span>
              <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ville, massif, adresse…" className="h-13 w-full rounded-xl border-0 bg-white pl-12 pr-4 text-base text-ink-900 placeholder:text-ink-400" />
            </label>
            <button type="submit" disabled={busy} className="inline-flex h-13 items-center justify-center gap-2 rounded-xl bg-ember-500 px-6 font-semibold transition hover:bg-ember-600 active:scale-[0.98] disabled:opacity-60">
              {busy ? <Loader2 className="size-5 animate-spin" /> : "Rechercher"}
            </button>
          </form>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm" aria-live="polite">
            <button onClick={locate} disabled={geo.status === "loading"} className="inline-flex items-center gap-1.5 font-medium text-pine-400 hover:text-pine-100 disabled:opacity-60">
              {geo.status === "loading" ? <Loader2 className="size-4 animate-spin" /> : <LocateFixed className="size-4" />}Autour de moi
            </button>
            {msg && <span className="line-clamp-1 text-ink-300">{msg}</span>}
          </div>

          <div className="rise rise-3 mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/creer" size="lg"><RouteIcon className="size-5" />Créer un parcours</ButtonLink>
            <ButtonLink href="/explorer" size="lg" variant="onDark">Explorer les itinéraires</ButtonLink>
          </div>
        </div>

        <div className="rise rise-2 relative h-[22rem] overflow-hidden rounded-3xl ring-1 ring-white/15 shadow-lift sm:h-[28rem] lg:h-[32rem]">
          <HeroMap ref={map} />
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-ink-900/80 px-2.5 py-1.5 text-[11px] font-medium text-ink-100 backdrop-blur">
            Tracés orange : <b className="text-ember-400">données de démonstration</b>
          </div>
        </div>
      </div>
    </section>
  );
}
