import { notFound } from "next/navigation";
import Link from "next/link";
import { Hammer, ArrowLeft } from "lucide-react";
import { MODULES } from "@/lib/site";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";

export function generateStaticParams() { return Object.keys(MODULES).map((module) => ({ module })); }
export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ module: string }> }) {
  const m = MODULES[(await params).module];
  return { title: m ? m.title : "Introuvable" };
}

export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const m = MODULES[(await params).module];
  if (!m) notFound();
  return (
    <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900"><ArrowLeft className="size-4" />Accueil</Link>
      <div className="mt-6 flex items-center gap-3"><span className="grid size-12 place-items-center rounded-xl bg-ember-100 text-ember-600"><Hammer className="size-6" /></span><Badge tone="ember">En développement · Étape {m.step} sur 10</Badge></div>
      <h1 className="mt-5 text-4xl font-extrabold">{m.title}</h1>
      <p className="mt-3 text-lg text-ink-600">{m.summary}</p>
      <h2 className="mt-10 text-lg font-semibold">Prévu dans cette étape</h2>
      <ul className="mt-3 grid gap-2">{m.items.map((i) => <li key={i} className="rounded-lg bg-white px-4 py-3 text-sm ring-1 ring-ink-100">{i}</li>)}</ul>
      <p className="mt-8 text-sm text-ink-500">Cette fonctionnalité n'est pas encore disponible : aucune version simulée n'est proposée.</p>
      <div className="mt-6"><ButtonLink href="/feuille-de-route" variant="secondary">Voir la feuille de route</ButtonLink></div>
    </div>
  );
}
