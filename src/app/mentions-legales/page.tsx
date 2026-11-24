import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, ContactEmail } from "@/components/legal/legal-page";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Mentions légales", description: "Éditeur, hébergeurs et contact du site Crête.", alternates: { canonical: "/mentions-legales/" } };

export default function Page() {
  return (
    <LegalPage title="Mentions légales">
      <section aria-labelledby="editeur">
        <h2 id="editeur">Éditeur du site</h2>
        <p>Crête est un site <b>non professionnel</b>, gratuit et sans publicité, édité par un particulier. Conformément à la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l&apos;économie numérique (art. 1-1, III), l&apos;éditeur a choisi de ne pas publier son identité : ses nom, prénom et adresse ont été communiqués à l&apos;hébergeur ci-dessous, qui les tient à la disposition de l&apos;autorité judiciaire.</p>
        <p>Directeur de la publication : l&apos;éditeur du site.</p>
      </section>
      <section aria-labelledby="contact-titre" id="contact">
        <h2 id="contact-titre">Contact</h2>
        <p>Pour toute question, signalement de contenu ou demande concernant vos données personnelles : <ContactEmail />.</p>
      </section>
      <section aria-labelledby="hebergement">
        <h2 id="hebergement">Hébergement</h2>
        <h3>Pages du site</h3>
        <p>{LEGAL.host.name} — {LEGAL.host.address} — téléphone : {LEGAL.host.phone} — <a href={LEGAL.host.url} rel="noopener noreferrer" target="_blank">{LEGAL.host.url.replace("https://", "")}</a></p>
        <h3>Comptes et données synchronisées</h3>
        <p>{LEGAL.dataHost.name} — {LEGAL.dataHost.address} — <a href={LEGAL.dataHost.url} rel="noopener noreferrer" target="_blank">{LEGAL.dataHost.url.replace("https://", "")}</a>. Données stockées dans la région : {LEGAL.dataHost.region}.</p>
      </section>
      <section aria-labelledby="pi">
        <h2 id="pi">Propriété intellectuelle et sources</h2>
        <p>Le code, la mise en page et les textes du site appartiennent à l&apos;éditeur. Les fonds de carte et données géographiques proviennent de sources ouvertes dont les licences et attributions sont détaillées sur la page <Link href="/licences">Données &amp; licences</Link>. Les parcours, textes et photos publiés par les utilisateurs restent leur propriété (voir les <Link href="/cgu">conditions d&apos;utilisation</Link>).</p>
      </section>
      <section aria-labelledby="donnees">
        <h2 id="donnees">Données personnelles</h2>
        <p>Voir la <Link href="/confidentialite">politique de confidentialité</Link> et la page <Link href="/cookies">cookies et stockage</Link>.</p>
      </section>
    </LegalPage>
  );
}
