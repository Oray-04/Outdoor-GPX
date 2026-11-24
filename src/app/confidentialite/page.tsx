import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, ContactEmail } from "@/components/legal/legal-page";
import { LEGAL } from "@/lib/legal";
import { THIRD_PARTIES } from "@/lib/third-parties";

export const metadata: Metadata = { title: "Politique de confidentialité", description: "Quelles données Crête traite, pourquoi, combien de temps, et comment exercer vos droits.", alternates: { canonical: "/confidentialite/" } };

export default function Page() {
  return (
    <LegalPage title="Politique de confidentialité" intro={<p>Crête fonctionne d&apos;abord <b>sans compte</b> : vos parcours, événements et réglages restent dans votre navigateur et ne nous sont pas transmis. Cette page décrit précisément ce qui sort de votre appareil, et dans quel cas. Le site n&apos;a <b>aucune publicité, aucune mesure d&apos;audience et ne vend aucune donnée</b>.</p>}>
      <section aria-labelledby="responsable">
        <h2 id="responsable">Responsable du traitement</h2>
        <p>L&apos;éditeur du site, particulier (voir les <Link href="/mentions-legales">mentions légales</Link>). Contact pour toute question ou demande : <ContactEmail />.</p>
      </section>

      <section aria-labelledby="sans-compte">
        <h2 id="sans-compte">Sans compte : vos données restent sur votre appareil</h2>
        <p>Parcours, activités, collections, événements (y compris la logistique et les bénévoles), photos, plans nutritionnels, favoris et réglages sont enregistrés dans le stockage de votre navigateur. Nous n&apos;y avons pas accès. Vous pouvez les exporter (page Administration, « Exporter tout ») ou les effacer à tout moment en vidant les données du site dans votre navigateur. Détail du stockage utilisé : <Link href="/cookies">cookies et stockage</Link>.</p>
      </section>

      <section aria-labelledby="traitements">
        <h2 id="traitements">Ce que nous traitons, pourquoi et combien de temps</h2>

        <h3>1. Votre compte (facultatif)</h3>
        <ul>
          <li><b>Données</b> : adresse e-mail, mot de passe (enregistré chiffré par notre hébergeur, jamais visible, même par nous), identifiant technique, dates de création et de connexion ; nom affiché et présentation si vous les renseignez.</li>
          <li><b>But</b> : créer et sécuriser votre compte, vous connecter, envoyer les e-mails indispensables (confirmation, lien de connexion, réinitialisation du mot de passe).</li>
          <li><b>Base légale</b> : exécution du contrat (les <Link href="/cgu">conditions d&apos;utilisation</Link> que vous acceptez à l&apos;inscription).</li>
          <li><b>Durée</b> : tant que le compte existe. Vous pouvez le supprimer vous-même depuis « Mon espace » : le compte et toutes les données associées sont alors effacés de la base.</li>
        </ul>

        <h3>2. Synchronisation de vos données entre appareils</h3>
        <ul>
          <li><b>Données</b> : le contenu que vous créez dans le site (parcours, activités, collections, notes et signalements personnels, événements avec leur logistique, favoris, calques, profil).</li>
          <li><b>But</b> : retrouver vos données sur tous vos appareils.</li>
          <li><b>Base légale</b> : exécution du contrat.</li>
          <li><b>Durée</b> : jusqu&apos;à ce que vous supprimiez l&apos;élément ou votre compte. Ces données sont privées : chaque compte n&apos;accède qu&apos;aux siennes (règles d&apos;accès appliquées par la base de données).</li>
        </ul>

        <h3>3. Contenus que vous choisissez de publier</h3>
        <ul>
          <li><b>Données</b> : parcours, collections et événements passés en « public », avec le nom affiché de votre profil et sa présentation ; pour un événement : nom de l&apos;organisateur, informations de la page, carte des coureurs (points utiles aux participants uniquement — jamais les bénévoles, effectifs ni consignes internes).</li>
          <li><b>But</b> : les rendre consultables par tous les visiteurs.</li>
          <li><b>Base légale</b> : exécution du contrat, à votre demande expresse (bouton de publication).</li>
          <li><b>Durée</b> : jusqu&apos;à ce que vous les repassiez en privé, les supprimiez ou supprimiez votre compte. Une fois publiés, ces contenus sont visibles de tous et peuvent être indexés par des moteurs de recherche ou des outils d&apos;intelligence artificielle.</li>
        </ul>

        <h3>4. Données des bénévoles et de l&apos;équipe saisies par un organisateur</h3>
        <ul>
          <li><b>Données</b> : nom, téléphone, e-mail, horaires, poste et consignes des personnes ajoutées par un organisateur dans Organisation Trail.</li>
          <li><b>Qui est responsable</b> : l&apos;organisateur de l&apos;événement, qui décide de les saisir et doit en informer les personnes concernées. Crête ne les utilise pas et ne les publie jamais. Elles restent sur l&apos;appareil de l&apos;organisateur, et ne sont copiées chez notre hébergeur que si l&apos;organisateur a un compte (synchronisation, point 2) : nous agissons alors comme simple hébergeur pour son compte.</li>
          <li><b>Durée</b> : décidée par l&apos;organisateur ; effacées avec l&apos;événement ou son compte. Une personne concernée peut s&apos;adresser à l&apos;organisateur, ou à nous si elle ne parvient pas à le joindre.</li>
        </ul>

        <h3>5. Cartes, calculs et services externes</h3>
        <ul>
          <li><b>Données</b> : votre adresse IP, le type de navigateur et la zone ou les points concernés (tuiles de carte affichées, tracé à calculer, lieu recherché, coordonnées pour la météo ou les altitudes).</li>
          <li><b>But</b> : afficher les cartes, calculer les itinéraires, les altitudes, la météo, rechercher une adresse, les commerces et points d&apos;eau, l&apos;analyse cadastrale.</li>
          <li><b>Base légale</b> : intérêt légitime (faire fonctionner le service que vous utilisez). Ces requêtes partent directement de votre navigateur vers chaque service, responsable de ses propres journaux techniques. Aucun d&apos;eux ne dépose de cookie via le site.</li>
          <li><b>Services concernés</b> : voir le tableau ci-dessous.</li>
        </ul>

        <h3>6. Votre position (géolocalisation)</h3>
        <ul>
          <li><b>Quand</b> : uniquement si vous appuyez sur un bouton « Me localiser » et l&apos;autorisez dans votre navigateur.</li>
          <li><b>Usage</b> : centrer la carte ou choisir un départ. Votre position n&apos;est ni enregistrée ni transmise à l&apos;éditeur ; si vous l&apos;utilisez comme départ d&apos;un calcul, les coordonnées sont envoyées au service de calcul (point 5).</li>
          <li><b>Base légale</b> : votre consentement, retirable à tout moment dans les réglages du navigateur.</li>
        </ul>

        <h3>7. Journaux techniques de l&apos;hébergeur</h3>
        <ul>
          <li><b>Données</b> : adresse IP, date, page demandée, navigateur, enregistrées par {LEGAL.host.name} et {LEGAL.dataHost.name} lors de chaque requête.</li>
          <li><b>But</b> : sécurité, prévention des abus, respect des obligations légales des hébergeurs.</li>
          <li><b>Base légale</b> : intérêt légitime et obligation légale.</li>
          <li><b>Durée</b> : selon l&apos;hébergeur, au plus un an.</li>
        </ul>

        <h3>8. Vos messages par e-mail</h3>
        <ul>
          <li><b>Données</b> : votre adresse et le contenu du message.</li>
          <li><b>But</b> : vous répondre. <b>Base légale</b> : intérêt légitime. <b>Durée</b> : trois ans après le dernier échange.</li>
        </ul>
      </section>

      <section aria-labelledby="destinataires">
        <h2 id="destinataires">Qui a accès à vos données</h2>
        <ul>
          <li>L&apos;éditeur, pour l&apos;administration du service (par exemple retirer un contenu public signalé).</li>
          <li>{LEGAL.dataHost.name}, hébergeur des comptes et des données synchronisées, en tant que sous-traitant ; base située dans la région : {LEGAL.dataHost.region}.</li>
          <li>{LEGAL.host.name}, hébergeur des pages du site (France).</li>
          <li>Tout visiteur, pour les seuls contenus que vous publiez (point 3).</li>
        </ul>
        <p>Aucune donnée n&apos;est vendue, louée ni utilisée à des fins publicitaires.</p>
      </section>

      <section aria-labelledby="transferts">
        <h2 id="transferts">Transferts hors de l&apos;Union européenne</h2>
        <p>Les données de compte sont stockées en France. {LEGAL.dataHost.name} est une société américaine : un accès depuis les États-Unis, par exemple pour l&apos;assistance technique, reste possible. Il est encadré par son accord de traitement des données, qui comprend les clauses contractuelles types de la Commission européenne.</p>
        <p>Parmi les services externes du point 5, certains sont situés hors de l&apos;Union européenne (indiqués dans le tableau) : ils reçoivent seulement votre adresse IP et la zone affichée, au moment où vous utilisez la fonction concernée.</p>
      </section>

      <section aria-labelledby="services">
        <h2 id="services">Services externes appelés par votre navigateur</h2>
        <div className="overflow-x-auto"><table>
          <thead><tr><th>Service</th><th>Pour quoi</th><th>Pays</th><th>Hors UE</th></tr></thead>
          <tbody>{THIRD_PARTIES.map((t) => <tr key={t.name}><td><b>{t.name}</b><br /><span className="text-ink-500">{t.operator}</span></td><td>{t.use}</td><td>{t.country}</td><td>{t.outsideEU}</td></tr>)}</tbody>
        </table></div>
      </section>

      <section aria-labelledby="droits">
        <h2 id="droits">Vos droits</h2>
        <p>Vous disposez des droits d&apos;accès, de rectification, d&apos;effacement, d&apos;opposition, de limitation et de portabilité de vos données, ainsi que du droit de définir des directives sur leur sort après votre décès. En pratique :</p>
        <ul>
          <li><b>Accès, portabilité</b> : « Exporter tout » (page Administration) fournit toutes vos données au format JSON ; nous pouvons aussi vous transmettre une copie de vos données de compte sur demande.</li>
          <li><b>Rectification</b> : modifiez vos contenus et votre profil directement dans le site.</li>
          <li><b>Effacement</b> : « Supprimer mon compte » dans Mon espace efface le compte et toutes les données associées ; un contenu peut aussi être supprimé individuellement.</li>
          <li><b>Toute autre demande</b> : écrivez à <ContactEmail />. Nous répondons dans un délai d&apos;un mois.</li>
        </ul>
        <p>Si vous estimez que vos droits ne sont pas respectés, vous pouvez introduire une réclamation auprès de la CNIL : <a href="https://www.cnil.fr/fr/plaintes" rel="noopener noreferrer" target="_blank">www.cnil.fr/fr/plaintes</a>.</p>
      </section>

      <section aria-labelledby="mineurs">
        <h2 id="mineurs">Mineurs</h2>
        <p>La création d&apos;un compte est réservée aux personnes de 15 ans et plus ; en dessous, l&apos;accord d&apos;un titulaire de l&apos;autorité parentale est nécessaire. L&apos;utilisation sans compte ne transmet aucune donnée à l&apos;éditeur.</p>
      </section>

      <section aria-labelledby="securite">
        <h2 id="securite">Sécurité</h2>
        <p>Connexions chiffrées (HTTPS), mots de passe jamais stockés en clair, accès aux données privées limité au seul titulaire du compte par des règles appliquées dans la base de données, politique de sécurité des contenus limitant les services que le site peut appeler.</p>
      </section>

      <section aria-labelledby="modifs">
        <h2 id="modifs">Modifications</h2>
        <p>Cette politique peut évoluer, par exemple si une fonction est ajoutée. La date de mise à jour figure en haut de la page ; en cas de changement important, les titulaires de compte en seront informés.</p>
      </section>
    </LegalPage>
  );
}
