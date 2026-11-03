export const metadata = { title: "Données et licences" };
export default function Page() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-4xl font-extrabold">Données et licences</h1>
      <div className="mt-8 grid gap-6 text-ink-700 leading-relaxed">
        <section><h2 className="text-xl font-semibold">Données de démonstration</h2><p className="mt-2">Les parcours et événements affichés sont générés algorithmiquement et marqués « Démo ». Ils ne représentent aucun sentier, parcours officiel ou événement réel.</p></section>
        <section><h2 className="text-xl font-semibold">Fond de carte</h2><p className="mt-2">Le fond actuel provient d'OpenStreetMap (© contributeurs OpenStreetMap, ODbL). Les serveurs de tuiles publics d'OpenStreetMap ne sont pas destinés à une utilisation en production : un fournisseur de tuiles sous contrat sera configuré avant la mise en ligne (étape 3 et 10).</p></section>
        <section><h2 className="text-xl font-semibold">Recherche de lieux</h2><p className="mt-2">La recherche utilise le service de géocodage Nominatim d'OpenStreetMap, sur requête explicite de l'utilisateur uniquement.</p></section>
        <section><h2 className="text-xl font-semibold">Position</h2><p className="mt-2">La géolocalisation n'est demandée qu'après un clic. La position reste dans le navigateur et n'est pas transmise à nos serveurs.</p></section>
      </div>
    </div>
  );
}
