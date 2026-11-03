import { Hero } from "@/components/home/hero";
import { NearYou } from "@/components/home/near-you";
import { Popular, Features, Events, Destinations, Stats, PricingTeaser, SportChips } from "@/components/home/sections";
import { Section } from "@/components/ui/section";

export default function Home() {
  return (
    <>
      <Hero />
      <SportChips />
      <Section eyebrow="Populaires" title="Parcours à la une" action={{ href: "/parcours", label: "Tous les parcours" }}><Popular /></Section>
      <Section tone="white" eyebrow="Près de chez vous" title="Recommandés selon votre position"><NearYou /></Section>
      <Section eyebrow="Fonctionnalités" title="Des outils de terrain, dans le navigateur"><Features /></Section>
      <Section tone="white" eyebrow="Calendrier" title="Prochaines compétitions" action={{ href: "/evenements", label: "Voir le calendrier" }}><Events /></Section>
      <Section eyebrow="Inspiration" title="Destinations à découvrir"><Destinations /></Section>
      <div className="bg-ink-900"><div className="mx-auto max-w-7xl px-4 py-16 sm:px-6"><h2 className="mb-8 text-3xl font-bold text-white sm:text-4xl">La communauté en chiffres</h2><Stats /></div></div>
      <Section eyebrow="Offres" title="Un niveau pour chaque pratique"><PricingTeaser /></Section>
    </>
  );
}
