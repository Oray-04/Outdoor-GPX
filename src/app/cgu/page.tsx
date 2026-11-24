import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, ContactEmail } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Conditions générales d'utilisation", description: "Règles d'utilisation de Crête : compte, contenus publiés, organisation d'événements, responsabilités.", alternates: { canonical: "/cgu/" } };

export default function Page() {
  return (
    <LegalPage title="Conditions générales d'utilisation" intro={<p>Ces conditions encadrent l&apos;utilisation de Crête. Utiliser le site sans compte suppose de les respecter ; créer un compte implique de les accepter expressément.</p>}>
      <section aria-labelledby="objet">
        <h2 id="objet">1. Le service</h2>
        <p>Crête est un service <b>gratuit</b>, sans publicité, édité par un particulier (voir les <Link href="/mentions-legales">mentions légales</Link>). Il permet de tracer, importer, explorer et partager des parcours de trail, de randonnée et de vélo, de préparer sa nutrition, et d&apos;organiser des événements (courses, logistique, bénévoles, documents, page publique).</p>
        <p>Sans compte, tout fonctionne sur votre appareil. Le compte, facultatif, sert à synchroniser vos données entre appareils et à publier des contenus.</p>
      </section>

      <section aria-labelledby="compte">
        <h2 id="compte">2. Compte</h2>
        <ul>
          <li>Le compte est réservé aux personnes de 15 ans et plus ; en dessous, l&apos;accord d&apos;un titulaire de l&apos;autorité parentale est nécessaire.</li>
          <li>Vous fournissez une adresse e-mail valide et gardez votre mot de passe confidentiel. Toute action faite depuis votre compte est réputée faite par vous.</li>
          <li>Le nom affiché et la présentation de votre profil sont publics : n&apos;y mettez pas d&apos;information que vous ne voulez pas rendre visible.</li>
        </ul>
      </section>

      <section aria-labelledby="usage">
        <h2 id="usage">3. Règles d&apos;utilisation</h2>
        <p>Vous vous engagez à ne pas :</p>
        <ul>
          <li>publier un contenu illicite, injurieux, diffamatoire, discriminatoire, portant atteinte à la vie privée ou aux droits d&apos;un tiers (photo, texte ou tracé dont vous n&apos;avez pas les droits) ;</li>
          <li>publier les données personnelles d&apos;une autre personne sans son accord ;</li>
          <li>usurper l&apos;identité d&apos;une personne ou d&apos;un organisateur, ou présenter un événement fictif comme réel ;</li>
          <li>perturber le service ou les services cartographiques qu&apos;il utilise (requêtes automatisées massives, extraction systématique, contournement des limites techniques) ;</li>
          <li>tenter d&apos;accéder aux données d&apos;un autre compte.</li>
        </ul>
      </section>

      <section aria-labelledby="organisateurs">
        <h2 id="organisateurs">4. Organisateurs d&apos;événements</h2>
        <ul>
          <li>Vous êtes seul responsable de votre événement, de ses autorisations (mairie, préfecture, propriétaires, gestionnaires d&apos;espaces protégés) et des informations publiées sur sa page.</li>
          <li><b>Bénévoles et équipe</b> : en saisissant leurs nom, téléphone ou e-mail, vous êtes responsable de ces données. Informez-les de leur enregistrement et de son usage (organisation de l&apos;événement), ne collectez que le nécessaire, et supprimez-les quand elles ne servent plus.</li>
          <li>Les documents et analyses générés par le site (règlement, dossier administratif, échéancier, analyse cadastrale et réglementaire, estimations) sont des <b>aides à la préparation</b> : ils ne valent ni avis juridique ni autorisation, et doivent être vérifiés avant usage.</li>
        </ul>
      </section>

      <section aria-labelledby="terrain">
        <h2 id="terrain">5. Sur le terrain</h2>
        <p>Les tracés, distances, dénivelés, durées estimées, données de chemins, météo et repères nutritionnels sont <b>indicatifs</b>. Ils proviennent de calculs et de sources ouvertes qui peuvent être incomplètes ou datées. Vérifiez toujours la praticabilité, les règles d&apos;accès (propriétés privées, zones protégées, périodes de chasse), la météo officielle et votre niveau avant de partir. Les repères nutritionnels ne remplacent pas l&apos;avis d&apos;un professionnel de santé.</p>
      </section>

      <section aria-labelledby="contenus">
        <h2 id="contenus">6. Vos contenus</h2>
        <ul>
          <li>Vous restez propriétaire de vos parcours, textes et photos. En publiant un contenu, vous autorisez gratuitement l&apos;éditeur à l&apos;héberger, l&apos;afficher et le rendre téléchargeable (fichier GPX notamment) par les visiteurs, pour la durée de sa publication.</li>
          <li>Vous garantissez avoir les droits nécessaires sur ce que vous publiez. Un tracé importé d&apos;une autre source doit pouvoir être partagé selon sa licence.</li>
          <li>Pour signaler un contenu illicite : <ContactEmail />, en précisant l&apos;adresse de la page et la raison. Tout contenu manifestement illicite est retiré promptement.</li>
        </ul>
      </section>

      <section aria-labelledby="pi">
        <h2 id="pi">7. Propriété intellectuelle</h2>
        <p>Le site (code, interface, textes, logo) appartient à l&apos;éditeur. Les données cartographiques appartiennent à leurs producteurs et sont utilisées selon leurs licences, détaillées sur la page <Link href="/licences">Données &amp; licences</Link> (IGN, contributeurs OpenStreetMap, etc.).</p>
      </section>

      <section aria-labelledby="fin">
        <h2 id="fin">8. Fin d&apos;utilisation</h2>
        <ul>
          <li>Vous pouvez supprimer votre compte à tout moment depuis « Mon espace » : le compte, vos données synchronisées et vos contenus publiés sont effacés. Les données présentes sur votre appareil restent jusqu&apos;à ce que vous les effaciez.</li>
          <li>En cas de manquement grave à ces conditions (contenu illicite, atteinte à des tiers, perturbation du service), l&apos;éditeur peut retirer un contenu ou suspendre un compte, après vous en avoir informé sauf urgence.</li>
        </ul>
      </section>

      <section aria-labelledby="responsabilite">
        <h2 id="responsabilite">9. Responsabilité et disponibilité</h2>
        <p>Le service est fourni gratuitement, en l&apos;état. L&apos;éditeur fait ses meilleurs efforts pour qu&apos;il soit disponible et exact, mais ne garantit pas l&apos;absence d&apos;interruption, notamment quand un service cartographique externe est indisponible. Il ne peut être tenu responsable des conséquences d&apos;une sortie ou d&apos;un événement préparés avec le site, ni de la perte de données conservées uniquement sur votre appareil : exportez-les régulièrement. Rien dans ces conditions n&apos;écarte la responsabilité de l&apos;éditeur lorsque la loi l&apos;interdit.</p>
        <p>Le service peut évoluer ou s&apos;arrêter ; en cas d&apos;arrêt, les titulaires de compte seront prévenus suffisamment tôt pour exporter leurs données.</p>
      </section>

      <section aria-labelledby="modifs">
        <h2 id="modifs">10. Modification des conditions</h2>
        <p>Ces conditions peuvent être modifiées. La date de mise à jour figure en haut de la page ; en cas de changement important, les titulaires de compte en sont informés et peuvent supprimer leur compte s&apos;ils refusent les nouvelles conditions.</p>
      </section>

      <section aria-labelledby="loi">
        <h2 id="loi">11. Droit applicable</h2>
        <p>Ces conditions sont soumises au droit français. En cas de litige, une solution amiable est recherchée en priorité (<ContactEmail />) ; à défaut, les tribunaux français sont compétents, sous réserve des règles protectrices applicables aux consommateurs.</p>
      </section>
    </LegalPage>
  );
}
