import { Check, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Tarifs" };

const rows: [string, boolean, boolean, boolean][] = [
  ["Consultation des parcours", true, true, true],
  ["Recherche", true, true, true],
  ["Création basique", true, true, true],
  ["Profil personnel", true, true, true],
  ["Création avancée", false, true, true],
  ["Import / export GPS", false, true, true],
  ["Outils cartographiques avancés", false, true, true],
  ["Gestion des collections", false, true, true],
  ["Statistiques avancées", false, true, true],
  ["Cartes hors ligne (selon licences)", false, true, true],
  ["Gestion des événements et organisateurs", false, false, true],
  ["Outils logistiques et bénévoles", false, false, true],
  ["Exports professionnels", false, false, true],
  ["Comptes collaborateurs", false, false, true],
];
const Cell = ({ v }: { v: boolean }) => v ? <Check className="mx-auto size-5 text-pine-600" aria-label="Inclus" /> : <Minus className="mx-auto size-5 text-ink-300" aria-label="Non inclus" />;

export default function Page() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <Badge tone="ember">Prix non définis · paiement à l'étape 8</Badge>
      <h1 className="mt-4 text-4xl font-extrabold">Trois niveaux d'abonnement</h1>
      <p className="mt-3 text-ink-600">Les tarifs seront publiés avec l'intégration du paiement. L'architecture prévoit un prestataire interchangeable.</p>
      <div className="mt-10 overflow-x-auto rounded-2xl bg-white ring-1 ring-ink-100">
        <table className="w-full min-w-[34rem] text-sm">
          <thead><tr className="border-b border-ink-100 text-left"><th className="p-4 font-medium text-ink-500">Fonctionnalité</th>{["Gratuit", "Premium", "Professionnel"].map((t) => <th key={t} className="p-4 text-center font-display text-base font-bold">{t}</th>)}</tr></thead>
          <tbody>{rows.map(([l, a, b, c]) => <tr key={l} className="border-b border-ink-50 last:border-0"><td className="p-4">{l}</td><td><Cell v={a} /></td><td><Cell v={b} /></td><td><Cell v={c} /></td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
