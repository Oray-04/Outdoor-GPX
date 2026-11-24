import { Hero } from "@/components/home/hero";
import { NearYou } from "@/components/home/near-you";
import { Features, Destinations, SportChips } from "@/components/home/sections";
import { ReferenceHighlights, UpcomingEvents } from "@/components/home/live-sections";
import { Section } from "@/components/ui/section";
import type { Metadata } from "next";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { alternates: { canonical: "/" } };

/** Données structurées : application web gratuite (aide les moteurs et agents IA à comprendre le site). */
const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: LEGAL.siteName,
  url: `${LEGAL.siteUrl}/`,
  description: "Plateforme gratuite pour créer, explorer et partager des parcours GPS de trail, randonnée et vélo, préparer sa nutrition et organiser des événements sportifs.",
  applicationCategory: "SportsApplication",
  operatingSystem: "Web",
  inLanguage: "fr",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
};

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <Hero />
      <SportChips />
      <Section eyebrow="Grands itinéraires" title="Des traversées qui font rêver" action={{ href: "/explorer/?itineraire=", label: "Tous les itinéraires" }}><ReferenceHighlights /></Section>
      <Section tone="white" eyebrow="Près de chez vous" title="Vos parcours selon votre position"><NearYou /></Section>
      <Section eyebrow="Fonctionnalités" title="Des outils de terrain, dans le navigateur"><Features /></Section>
      <Section tone="white" eyebrow="Calendrier" title="Prochains événements" action={{ href: "/evenements", label: "Voir le calendrier" }}><UpcomingEvents /></Section>
      <Section eyebrow="Inspiration" title="Destinations à explorer"><Destinations /></Section>
    </>
  );
}
