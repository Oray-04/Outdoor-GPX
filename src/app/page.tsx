import { Hero } from "@/components/home/hero";
import { NearYou } from "@/components/home/near-you";
import { Features, Destinations, SportChips } from "@/components/home/sections";
import { ReferenceHighlights, UpcomingEvents } from "@/components/home/live-sections";
import { Section } from "@/components/ui/section";

export default function Home() {
  return (
    <>
      <Hero />
      <SportChips />
      <Section eyebrow="Grands itinéraires" title="Des traversées qui font rêver" action={{ href: "/itineraires", label: "Tous les itinéraires" }}><ReferenceHighlights /></Section>
      <Section tone="white" eyebrow="Près de chez vous" title="Vos parcours selon votre position"><NearYou /></Section>
      <Section eyebrow="Fonctionnalités" title="Des outils de terrain, dans le navigateur"><Features /></Section>
      <Section tone="white" eyebrow="Calendrier" title="Prochains événements" action={{ href: "/evenements", label: "Voir le calendrier" }}><UpcomingEvents /></Section>
      <Section eyebrow="Inspiration" title="Destinations à explorer"><Destinations /></Section>
    </>
  );
}
