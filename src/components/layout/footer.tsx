import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { SITE } from "@/lib/site";

const cols = [
  { title: "Produit", links: [["Explorer", "/explorer"], ["Créer un parcours", "/creer"], ["Générer des parcours", "/generer"], ["Bibliothèque", "/parcours"], ["Mes fichiers GPS", "/fichiers"], ["Suivi GPS", "/suivi"], ["Hors ligne", "/hors-ligne"], ["Tarifs", "/tarifs"]] },
  { title: "Compétitions", links: [["Calendrier", "/evenements"], ["Espace organisateurs", "/organisateurs"]] },
  { title: "Communauté", links: [["Communauté", "/communaute"], ["Mon espace", "/compte"]] },
  { title: "Projet", links: [["Charte graphique", "/charte"], ["Feuille de route", "/feuille-de-route"], ["Données & licences", "/licences"], ["Administration", "/admin"]] },
] as const;

export function Footer() {
  return (
    <footer className="bg-ink-950 text-ink-300">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <Logo light />
            <p className="mt-4 max-w-xs text-sm leading-relaxed">{SITE.tagline} Une plateforme indépendante pour traileurs, randonneurs, cyclistes et organisateurs.</p>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <h3 className="mb-3 text-sm font-semibold text-white">{c.title}</h3>
              <ul className="grid gap-2 text-sm">
                {c.links.map(([l, h]) => <li key={h}><Link href={h} className="transition-colors hover:text-white">{l}</Link></li>)}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs">
          <p>© {new Date().getFullYear()} {SITE.name}. Projet en construction : les parcours et événements affichés sont des données de démonstration.</p>
          <p>Cartes © contributeurs OpenStreetMap</p>
        </div>
      </div>
    </footer>
  );
}
