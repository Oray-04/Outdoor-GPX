"use client";
import { useMemo, useState } from "react";
import { Code2, Link2, Copy, Lock, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEFAULT_EMBED, embedHtml, embedUrl, encodeShared, shareUrl, type EmbedOptions } from "@/lib/embed";
import { routesRepo } from "@/lib/repo";
import { BASE } from "@/lib/url";
import type { SavedRoute } from "@/lib/types";

/** Visibilité, lien de partage et code d'intégration d'un de MES parcours. Rien n'est partageable tant que le parcours est privé. */
export function ShareBox({ route }: { route: SavedRoute }) {
  const [o, setO] = useState<EmbedOptions>(DEFAULT_EMBED); const [note, setNote] = useState<string | null>(null); const [tab, setTab] = useState<"lien" | "iframe">("lien");
  const pub = route.visibility === "public";
  const code = useMemo(() => (pub ? encodeShared(route) : ""), [pub, route]);
  const origin = typeof location !== "undefined" ? location.origin : "";
  const link = pub ? shareUrl(origin, BASE, code) : "", html = pub ? embedHtml(embedUrl(origin, BASE, code, o), `Parcours ${route.name}`, o.height) : "";
  const copy = async (t: string, what: string) => { try { await navigator.clipboard.writeText(t); setNote(`${what} copié.`); } catch { setNote("Copie impossible : sélectionnez le texte à la main."); } };
  const setVis = (v: "prive" | "public") => { routesRepo.upsert({ ...route, visibility: v, updatedAt: Date.now() }); setNote(v === "public" ? "Parcours public : vous pouvez maintenant le partager et l'intégrer." : "Parcours repassé en privé. Les liens déjà copiés contiennent une copie du tracé et restent lisibles par ceux qui les ont : ne partagez que ce que vous acceptez de diffuser."); };
  const ta = "w-full rounded-lg border border-ink-200 bg-ink-50 p-2 font-mono text-[11px] leading-snug text-ink-700";
  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-ink-100" aria-label="Partage et intégration">
      <h2 className="text-lg font-bold">Partager et intégrer</h2>
      <div role="group" aria-label="Visibilité du parcours" className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-ink-100 p-1 text-sm font-semibold">
        <button type="button" aria-pressed={!pub} onClick={() => setVis("prive")} className={`flex items-center justify-center gap-1.5 rounded-lg py-2 ${!pub ? "bg-white shadow" : "text-ink-600"}`}><Lock className="size-4" />Privé</button>
        <button type="button" aria-pressed={pub} onClick={() => setVis("public")} className={`flex items-center justify-center gap-1.5 rounded-lg py-2 ${pub ? "bg-white shadow" : "text-ink-600"}`}><Globe className="size-4" />Public</button>
      </div>
      {!pub ? <p className="mt-3 text-sm text-ink-600">Ce parcours est <b>privé</b> : vous seul le voyez, aucun lien ni code d'intégration n'est généré. Passez-le en public pour le partager.</p> : (<>
        <div role="tablist" className="mt-4 flex gap-1 text-sm font-semibold">
          <button role="tab" aria-selected={tab === "lien"} onClick={() => setTab("lien")} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 ${tab === "lien" ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100"}`}><Link2 className="size-4" />Lien de partage</button>
          <button role="tab" aria-selected={tab === "iframe"} onClick={() => setTab("iframe")} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 ${tab === "iframe" ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100"}`}><Code2 className="size-4" />Intégrer sur un site Web</button>
        </div>
        {tab === "lien" ? (<div className="mt-3 grid gap-2">
          <p className="text-sm text-ink-600">Toute personne ayant ce lien peut voir le parcours, télécharger son GPX et en créer une copie. Elle ne peut pas modifier votre original.</p>
          <textarea readOnly aria-label="Lien de partage" rows={3} className={ta} value={link} onFocus={(e) => e.currentTarget.select()} />
          <div><Button size="sm" onClick={() => copy(link, "Lien")}><Copy className="size-4" />Copier le lien</Button></div>
        </div>) : (<div className="mt-3 grid gap-2">
          <p className="text-sm text-ink-600">Collez ce code dans une page de votre site : la carte interactive s'y affiche directement, à la largeur de la page (ordinateur et mobile).</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <label className="flex items-center gap-1.5"><input type="checkbox" className="accent-[var(--color-pine-600)]" checked={o.stats} onChange={(e) => setO({ ...o, stats: e.target.checked })} />Distance et dénivelés</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" className="accent-[var(--color-pine-600)]" checked={o.profile} onChange={(e) => setO({ ...o, profile: e.target.checked })} />Profil altimétrique</label>
            <label className="flex items-center gap-1.5">Hauteur<select className="h-8 rounded-md border border-ink-200 bg-white px-1.5 text-sm" value={o.height} onChange={(e) => setO({ ...o, height: +e.target.value })}>{[360, 440, 520, 640, 760].map((h) => <option key={h} value={h}>{h} px</option>)}</select></label>
          </div>
          <textarea readOnly aria-label="Code d'intégration HTML" rows={5} className={ta} value={html} onFocus={(e) => e.currentTarget.select()} />
          <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => copy(html, "Code d'intégration")}><Copy className="size-4" />Copier le code</Button><a className="inline-flex h-9 items-center rounded-full border border-ink-200 px-3.5 text-sm font-semibold hover:border-brass-400" href={embedUrl(origin, BASE, code, o)} target="_blank" rel="noopener">Aperçu</a></div>
        </div>)}
        <p className="mt-3 text-xs text-ink-500">Le lien et le code contiennent uniquement ce parcours (tracé allégé à {Math.min(route.coords.length, 600)} points, statistiques, POI) : aucune donnée de compte, aucun autre parcours. Ils ne se mettent pas à jour si vous modifiez le parcours : copiez-les à nouveau.</p>
      </>)}
      {note && <p role="status" className="mt-2 text-sm text-pine-700">{note}</p>}
    </section>
  );
}
