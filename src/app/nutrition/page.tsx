import { Apple, Droplets, Flame, Timer } from "lucide-react";
import { TopoPattern } from "@/components/ui/route-card";
import { ButtonLink } from "@/components/ui/button";

export const metadata = { title: "Nutrition — bientôt disponible" };

/** Page d'attente : aucune fonctionnalité nutritionnelle n'existe encore, et rien n'est simulé. */
export default function Page() {
  const themes = [
    { icon: Flame, label: "Énergie" },
    { icon: Droplets, label: "Hydratation" },
    { icon: Timer, label: "Effort long" },
  ];
  return (
    <section className="relative isolate min-h-[calc(100dvh-4rem)] overflow-hidden bg-ink-950 text-white">
      <TopoPattern className="!opacity-[0.06] scale-150" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(50rem_26rem_at_50%_-10%,rgb(18_98_75/0.55),transparent_60%),radial-gradient(36rem_22rem_at_85%_110%,rgb(208_95_42/0.18),transparent_60%)]" aria-hidden="true" />
      <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-24 text-center sm:py-32">
        <span className="rise grid size-16 place-items-center rounded-2xl border border-brass-400/40 bg-white/[0.06] text-brass-400"><Apple className="size-7" /></span>
        <p className="eyebrow rise rise-2 mt-8 !text-brass-400">Nutrition</p>
        <h1 className="rise rise-2 mt-4 text-5xl font-medium leading-[1.03] sm:text-7xl">Bientôt <em className="font-normal italic text-brass-400">disponible</em></h1>
        <p className="rise rise-3 mt-6 max-w-xl text-lg leading-relaxed text-ink-200">Un espace consacré à l'alimentation des sorties longues est en préparation. Il n'y a encore rien à utiliser ici : nous préférons ne rien afficher plutôt que des outils incomplets.</p>
        <ul className="rise rise-3 mt-10 flex flex-wrap justify-center gap-3" aria-label="Thèmes envisagés">
          {themes.map(({ icon: I, label }) => <li key={label} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.05] px-4 py-2 text-sm text-white/80"><I className="size-4 text-brass-400" />{label}</li>)}
        </ul>
        <div className="hairline mt-12 w-64" aria-hidden="true" />
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/creer" size="lg">Créer un parcours</ButtonLink>
          <ButtonLink href="/explorer/?itineraire=" size="lg" variant="onDark">Voir les itinéraires</ButtonLink>
        </div>
      </div>
    </section>
  );
}
