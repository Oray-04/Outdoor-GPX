import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/legal-page";
import { THIRD_PARTIES } from "@/lib/third-parties";

export const metadata: Metadata = { title: "Cookies et stockage", description: "Crête n'utilise aucun cookie de mesure d'audience ni de publicité. Détail du stockage local strictement nécessaire.", alternates: { canonical: "/cookies/" } };

/** Stockage réellement utilisé par le site (vérifié dans le code : store.ts, auth.tsx/Supabase, sw.js, offline.ts, editor.tsx, explorer). */
const STORAGE: [string, string, string, string][] = [
  ["crete:* (stockage local)", "Crête", "Vos parcours, événements, photos, réglages, favoris, plans nutritionnels, préférences d'affichage, clé Thunderforest si vous en saisissez une : le fonctionnement même de l'application, sans compte.", "Jusqu'à ce que vous les supprimiez ou vidiez les données du site"],
  ["sb-…-auth-token (stockage local)", "Crête, via Supabase", "Maintenir votre connexion si vous avez un compte.", "Jusqu'à la déconnexion (jeton renouvelé automatiquement)"],
  ["crete:editor-ref, crete:iti:* (stockage de session)", "Crête", "Mémoriser pendant la visite le calque de référence de l'éditeur et les résultats de l'itinérance (éviter de refaire la recherche).", "Fermeture de l'onglet"],
  ["crete-app-v1, crete-tiles-v1 (cache du navigateur)", "Crête (service worker)", "Mode hors ligne : pages visitées et zones de carte que vous avez choisi de télécharger.", "Jusqu'à suppression depuis la page Hors ligne ou des données du site"],
];

export default function Page() {
  return (
    <LegalPage title="Cookies et stockage" intro={<p><b>Crête ne dépose aucun cookie de mesure d&apos;audience, de publicité ou de réseau social</b>, et n&apos;intègre aucun traceur tiers. C&apos;est pourquoi aucun bandeau de consentement ne s&apos;affiche : le site n&apos;utilise que le stockage strictement nécessaire au service que vous demandez, exempté de consentement (article 82 de la loi Informatique et Libertés, lignes directrices de la CNIL).</p>}>
      <section aria-labelledby="stockage">
        <h2 id="stockage">Ce que le site enregistre sur votre appareil</h2>
        <div className="overflow-x-auto"><table>
          <thead><tr><th>Nom</th><th>Émetteur</th><th>Finalité</th><th>Durée</th></tr></thead>
          <tbody>{STORAGE.map(([n, e, f, d]) => <tr key={n}><td><code>{n}</code></td><td>{e}</td><td>{f}</td><td>{d}</td></tr>)}</tbody>
        </table></div>
        <p>Tous sont <b>strictement nécessaires</b> : sans eux, la fonction que vous utilisez ne marche pas. Aucun n&apos;est lu par un tiers.</p>
      </section>
      <section aria-labelledby="tiers">
        <h2 id="tiers">Services externes</h2>
        <p>Pour afficher les cartes et faire les calculs, votre navigateur interroge directement les services ci-dessous. Ils reçoivent votre adresse IP et la zone demandée, mais <b>ne déposent pas de cookie</b> via le site. Détails dans la <Link href="/confidentialite">politique de confidentialité</Link>.</p>
        <ul>{THIRD_PARTIES.map((t) => <li key={t.name}><b>{t.name}</b> — {t.use} ({t.country})</li>)}</ul>
      </section>
      <section aria-labelledby="effacer">
        <h2 id="effacer">Effacer ces données</h2>
        <p>Vous pouvez tout effacer depuis les réglages de votre navigateur (« Effacer les données du site »), supprimer les zones hors ligne depuis la page <Link href="/hors-ligne">Hors ligne</Link>, et exporter vos données au préalable depuis la page Administration (« Exporter tout »).</p>
        <p>Si un outil de mesure d&apos;audience ou tout autre traceur non nécessaire était ajouté un jour, un choix « Tout accepter / Tout refuser » vous serait demandé avant tout dépôt, et cette page serait mise à jour.</p>
      </section>
    </LegalPage>
  );
}
