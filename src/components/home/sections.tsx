import { MapPin, Route as RouteIcon, FileUp, LineChart, Users, Check } from "lucide-react";
import { DEMO_ROUTES, DEMO_EVENTS, DESTINATIONS } from "@/lib/demo-data";
import { DEMO_VMS } from "@/lib/route-model";
import { SPORTS, type Sport } from "@/lib/sports";
import { RouteCard, TopoPattern } from "@/components/ui/route-card";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
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

export function Popular() {
  return <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{DEMO_VMS.slice(0, 4).map((r) => <RouteCard key={r.id} route={r} />)}</div>;
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

export function Events() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {DEMO_EVENTS.map((e) => {
        const d = new Date(e.date);
        return (
          <article key={e.id} className="flex gap-4 rounded-[var(--radius-card)] bg-white p-5 shadow-card ring-1 ring-ink-100">
            <div className="grid size-16 shrink-0 place-items-center rounded-xl bg-ink-900 text-center text-white">
              <div><div className="font-display text-2xl font-bold leading-none">{d.getUTCDate()}</div><div className="mt-0.5 text-[11px] uppercase tracking-wider text-ink-300">{d.toLocaleDateString("fr-FR", { month: "short", timeZone: "UTC" })}</div></div>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><Badge tone="pine">{SPORTS[e.sport].label}</Badge><DemoBadge /></div>
              <h3 className="mt-1.5 font-semibold leading-snug">{e.name}</h3>
              <p className="mt-0.5 flex items-center gap-1 text-sm text-ink-500"><MapPin className="size-3.5" />{e.region}</p>
              <p className="mt-2 flex flex-wrap gap-x-3 text-sm text-ink-700">{e.formats.map((f) => <span key={f.label}>{f.label} · {f.km} km · {f.dplus} m D+</span>)}</p>
            </div>
          </article>
        );
      })}
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

export function Stats() {
  const km = DEMO_ROUTES.reduce((a, r) => a + r.stats.distanceM, 0) / 1000;
  const dp = DEMO_ROUTES.reduce((a, r) => a + r.stats.gainM, 0);
  const items = [
    ["Parcours de démo", DEMO_ROUTES.length.toString()],
    ["Kilomètres tracés", Math.round(km).toLocaleString("fr-FR")],
    ["Dénivelé positif cumulé", `${Math.round(dp).toLocaleString("fr-FR")} m`],
    ["Événements de démo", DEMO_EVENTS.length.toString()],
  ];
  return (
    <div>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] bg-white/10 lg:grid-cols-4">
        {items.map(([l, v]) => (
          <div key={l} className="bg-ink-800 p-6"><dd className="font-display text-3xl font-bold text-white sm:text-4xl">{v}</dd><dt className="mt-1 text-sm text-ink-300">{l}</dt></div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-ink-400">Calculé à partir des données de démonstration. Les statistiques de la communauté réelle viendront avec les comptes (étape 2).</p>
    </div>
  );
}

const tiers = [
  { name: "Gratuit", desc: "Pour découvrir et tracer.", items: ["Consultation des parcours", "Recherche", "Création basique", "Profil personnel"] },
  { name: "Premium", desc: "Pour les pratiquants assidus.", items: ["Création avancée", "Import/export GPS", "Outils cartographiques", "Statistiques avancées"], hot: true },
  { name: "Professionnel", desc: "Pour les organisateurs.", items: ["Gestion d'événements", "Outils logistiques", "Bénévoles", "Comptes collaborateurs"] },
];
export function PricingTeaser() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {tiers.map((t) => (
        <div key={t.name} className={`rounded-[var(--radius-card)] p-6 ${t.hot ? "bg-ink-900 text-white shadow-lift" : "bg-white ring-1 ring-ink-100"}`}>
          <h3 className="text-xl font-bold">{t.name}</h3>
          <p className={`mt-1 text-sm ${t.hot ? "text-ink-300" : "text-ink-500"}`}>{t.desc}</p>
          <ul className="mt-5 grid gap-2 text-sm">{t.items.map((i) => <li key={i} className="flex gap-2"><Check className={`mt-0.5 size-4 shrink-0 ${t.hot ? "text-pine-400" : "text-pine-600"}`} />{i}</li>)}</ul>
        </div>
      ))}
      <div className="md:col-span-3"><ButtonLink href="/tarifs" variant="secondary">Voir le détail des offres</ButtonLink></div>
    </div>
  );
}

