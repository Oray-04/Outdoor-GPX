"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { SITE } from "@/lib/site";

const cols = [
  { title: "Parcours", links: [["Explorer", "/explorer"], ["Créer un parcours", "/creer"], ["Générer une boucle", "/generer"], ["Itinéraires", "/itineraires"], ["Itinérance", "/itinerance"], ["Bibliothèque", "/parcours"], ["Fichiers GPS", "/fichiers"], ["Suivi GPS", "/suivi"], ["Hors ligne", "/hors-ligne"]] },
  { title: "Événements", links: [["Tous les événements", "/evenements"], ["Espace organisateur", "/organisateurs"]] },
  { title: "Nutrition", links: [["Bientôt disponible", "/nutrition"]] },
  { title: "Plateforme", links: [["Mon espace", "/compte"], ["Collections", "/collections"], ["Données & licences", "/licences"], ["Feuille de route", "/feuille-de-route"], ["Administration", "/admin"]] },
] as const;

export function Footer() {
  const path = usePathname();
  if (path.startsWith("/integrer")) return null;
  return (
    <footer className="relative bg-ink-950 text-ink-300"><div className="hairline absolute inset-x-0 top-0" aria-hidden="true" />
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <Logo light />
            <p className="mt-4 max-w-xs text-sm leading-relaxed">{SITE.tagline} Une plateforme indépendante pour traileurs, randonneurs, cyclistes et organisateurs.</p>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <h3 className="eyebrow mb-3 !text-brass-400">{c.title}</h3>
              <ul className="grid gap-2 text-sm">
                {c.links.map(([l, h]) => <li key={h}><Link href={h} className="transition-colors hover:text-white">{l}</Link></li>)}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs">
          <p>© {new Date().getFullYear()} {SITE.name}. Plateforme indépendante. Vos parcours restent sur votre appareil tant que vous ne les publiez pas.</p>
          <p>Cartes © contributeurs OpenStreetMap</p>
        </div>
      </div>
    </footer>
  );
}
