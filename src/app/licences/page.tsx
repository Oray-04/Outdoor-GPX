export const metadata = { title: "Données et licences" };
export default function Page() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-4xl font-extrabold">Données et licences</h1>
      <div className="mt-8 grid gap-6 text-ink-700 leading-relaxed">
        <section><h2 className="text-xl font-semibold">Données de démonstration</h2><p className="mt-2">Les parcours et événements affichés sont générés algorithmiquement et marqués « Démo ». Ils ne représentent aucun sentier, parcours officiel ou événement réel.</p></section>
        <section><h2 className="text-xl font-semibold">Fonds de carte</h2><p className="mt-2">Plan, photographies aériennes et pentes : © IGN – Géoplateforme (data.geopf.fr). Les conditions de licence de chaque couche doivent être vérifiées avant la mise en ligne. Hors de France, le fond OpenStreetMap (© contributeurs OpenStreetMap, ODbL) est utilisé ; ses serveurs publics ne sont pas destinés à la production et seront remplacés avant l'étape 10.</p></section>
        <section><h2 className="text-xl font-semibold">Recherche de lieux</h2><p className="mt-2">La recherche utilise le géocodage de la Géoplateforme, avec repli sur Nominatim (OpenStreetMap) hors France, sur requête explicite de l'utilisateur uniquement.</p></section>
        <section><h2 className="text-xl font-semibold">Altitude, itinéraires, points d'intérêt</h2><p className="mt-2">Altitudes et tracé sur chemins : services de la Géoplateforme (IGN). Points d'eau, sommets, abris et points de vue : données OpenStreetMap (ODbL) via Overpass, à la demande.</p></section>
        <section><h2 className="text-xl font-semibold">Position</h2><p className="mt-2">La géolocalisation n'est demandée qu'après un clic. La position reste dans le navigateur et n'est pas transmise à nos serveurs.</p></section>
      </div>
    </div>
  );
}
