import { Search, Download, Heart } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { Logo } from "@/components/ui/logo";
import { RouteCard } from "@/components/ui/route-card";
import { DEMO_ROUTES } from "@/lib/demo-data";

export const metadata = { title: "Charte graphique" };

const palettes: [string, string[]][] = [
  ["Encre", ["ink-950", "ink-900", "ink-700", "ink-500", "ink-300", "ink-100", "paper"]],
  ["Pin (marque)", ["pine-700", "pine-600", "pine-500", "pine-400", "pine-100"]],
  ["Braise (action)", ["ember-600", "ember-500", "ember-400", "ember-100"]],
  ["Glacier (données)", ["glacier-600", "glacier-500", "glacier-100"]],
];

export default function Page() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
      <h1 className="text-4xl font-extrabold">Charte graphique</h1>
      <p className="mt-3 max-w-2xl text-ink-600">Système de design de Crête : couleurs, typographies, boutons et composants réutilisables. Les jetons sont définis dans <code>globals.css</code>.</p>

      <Block title="Logo"><div className="flex flex-wrap gap-6"><div className="rounded-xl bg-white p-6 ring-1 ring-ink-100"><Logo /></div><div className="rounded-xl bg-ink-900 p-6"><Logo light /></div></div></Block>

      <Block title="Couleurs">
        <div className="grid gap-5">{palettes.map(([n, cs]) => (
          <div key={n}><p className="mb-2 text-sm font-semibold text-ink-600">{n}</p><div className="flex flex-wrap gap-2">{cs.map((c) => (
            <div key={c} className="w-24"><div className="h-14 rounded-lg ring-1 ring-black/5" style={{ background: `var(--color-${c})` }} /><p className="mt-1 text-xs text-ink-500">{c}</p></div>))}</div></div>))}
        </div>
      </Block>

      <Block title="Typographies">
        <p className="font-display text-4xl font-extrabold">Sora — titres</p>
        <p className="mt-2 text-lg">Inter — texte courant, interfaces et données (1 234 m D+).</p>
      </Block>

      <Block title="Boutons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Principal</Button><Button variant="brand">Marque</Button><Button variant="secondary">Secondaire</Button><Button variant="ghost">Discret</Button>
          <div className="rounded-xl bg-ink-900 p-3"><Button variant="onDark">Sur fond sombre</Button></div>
          <Button disabled>Désactivé</Button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3"><Button size="sm"><Search className="size-4" />Petit</Button><Button size="md"><Download className="size-4" />Moyen</Button><Button size="lg"><Heart className="size-5" />Grand</Button><ButtonLink href="/">Lien-bouton</ButtonLink></div>
      </Block>

      <Block title="Badges"><div className="flex flex-wrap gap-2"><Badge>Neutre</Badge><Badge tone="pine">Pin</Badge><Badge tone="ember">Braise</Badge><Badge tone="glacier">Glacier</Badge><DemoBadge /></div></Block>

      <Block title="Carte de parcours"><div className="max-w-xs"><RouteCard route={DEMO_ROUTES[0]} /></div></Block>
    </div>
  );
}
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mt-12"><h2 className="mb-4 border-b border-ink-100 pb-2 text-xl font-bold">{title}</h2>{children}</section>;
}
