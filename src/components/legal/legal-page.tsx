import type { ReactNode } from "react";
import Link from "next/link";
import { LEGAL, LEGAL_LINKS } from "@/lib/legal";

/** Gabarit des pages légales : titre, date de mise à jour, sommaire des autres pages, texte lisible. */
export function LegalPage({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="eyebrow">Informations légales</p>
      <h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">{title}</h1>
      <p className="mt-2 text-sm text-ink-500">Dernière mise à jour : {LEGAL.updated}</p>
      {intro && <div className="mt-4 text-ink-700">{intro}</div>}
      <nav aria-label="Pages légales" className="mt-6 flex flex-wrap gap-2 text-sm">
        {LEGAL_LINKS.map(([l, h]) => <Link key={h} href={h} className="rounded-full bg-ink-100 px-3 py-1 font-medium text-ink-700 hover:bg-ink-200">{l}</Link>)}
      </nav>
      <div className="legal-text mt-8 grid gap-8 text-[15px] leading-relaxed text-ink-800 [&_a]:font-semibold [&_a]:text-pine-700 [&_a]:underline [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-ink-950 [&_h3]:mt-4 [&_h3]:font-semibold [&_li]:mt-1 [&_p]:mt-2 [&_table]:mt-3 [&_table]:w-full [&_table]:text-sm [&_td]:border-t [&_td]:border-ink-100 [&_td]:py-2 [&_td]:pr-3 [&_td]:align-top [&_th]:pb-2 [&_th]:pr-3 [&_th]:text-left [&_th]:font-semibold [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
    </article>
  );
}

/** Lien de contact unique (adresse définie dans `LEGAL`). */
export function ContactEmail() {
  const e = LEGAL.contactEmail;
  return e.startsWith("[") ? <mark className="rounded bg-warn/20 px-1">{e}</mark> : <a href={`mailto:${e}`}>{e}</a>;
}
