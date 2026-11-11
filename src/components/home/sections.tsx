import { Route as RouteIcon, FileUp, LineChart, Users } from "lucide-react";
import { DESTINATIONS } from "@/lib/destinations";
import { SPORTS, type Sport } from "@/lib/sports";
import { TopoPattern } from "@/components/ui/route-card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

const SPORT_LIST: Sport[] = ["trail", "course", "rando", "marche", "vtt", "velo", "gravel"];

export function SportChips() {
  return (
    <div className="border-b border-ink-100 bg-white">
      <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-4 sm:px-6" role="list" aria-label="Disciplines">
        {SPORT_LIST.map((s) => (
          <Link role="listitem" key={s} href={`/parcours?sport=${s}`} className="shrink-0 rounded-full border border-ink-200 px-4 py-2 text-sm font-medium text-ink-700 transition hover:border-pine-500 hover:bg-pine-50 hover:text-pine-700">{SPORTS[s].label}</Link>
        ))}
      </div>
    </div>
  );
}

const features = [
  { icon: RouteIcon, title: "Éditeur de parcours", text: "Tracé sur chemins, points de passage, boucles, fusion, annuler/rétablir.", href: "/creer" },
  { icon: FileUp, title: "GPX, KML, GeoJSON, TCX", text: "Import, vérification, conversion et export de vos fichiers.", href: "/fichiers" },
  { icon: LineChart, title: "Profil altimétrique lié à la carte", text: "Pentes, kilométrage, ravitos et points d'eau, export image et PDF.", href: "/parcours" },
  { icon: Users, title: "Outils organisateurs", text: "Ravitaillements, barrières horaires, bénévoles, temps de passage.", href: "/organisateurs" },
];

export function Features() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {features.map(({ icon: I, title, text, href }) => (
        <Link key={title} href={href} className="group rounded-[var(--radius-card)] border border-ink-100 bg-paper p-6 transition hover:-translate-y-1 hover:border-pine-400 hover:shadow-card">
          <span className="grid size-11 place-items-center rounded-xl bg-pine-100 text-pine-700 transition group-hover:bg-pine-600 group-hover:text-white"><I className="size-5" /></span>
          <h3 className="mt-4 text-lg font-semibold">{title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{text}</p>
          <Badge tone="pine" className="mt-4">Disponible</Badge>
        </Link>
      ))}
    </div>
  );
}

export function Destinations() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {DESTINATIONS.map((d) => (
        <Link key={d.id} href={`/explorer?lng=${d.center[0]}&lat=${d.center[1]}`} className="group relative aspect-[4/5] overflow-hidden rounded-[var(--radius-card)] text-white" style={{ background: `linear-gradient(160deg, hsl(${d.hue} 50% 30%), hsl(${d.hue} 60% 14%))` }}>
          <TopoPattern className="transition duration-700 group-hover:scale-110" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/70">{d.country}</p>
            <h3 className="mt-1 text-xl font-bold">{d.name}</h3>
            <p className="mt-1 text-sm text-white/80">{d.blurb}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

