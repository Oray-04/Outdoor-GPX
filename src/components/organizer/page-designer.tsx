"use client";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ArrowDown, ArrowUp, Eye, EyeOff, ImagePlus, Lock, Monitor, Plus, RotateCcw, Smartphone, Trash2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useAllRoutes } from "@/lib/route-vm";
import { eventHref } from "@/lib/url";
import type { EventModel } from "@/lib/events";
import { BLOCKS, PRESETS, MAX_IMAGE_CHARS, addBlock, addable, canEditEventPage, defaultDesign, moveBlock, normalizeDesign, patchBlock, removeBlock, type BlockKind, type EventPageDesign, type PageTheme } from "@/lib/event-page";
import { DesignedEventPage } from "@/components/events/designed-page";

/** Réduit une image (bandeau) : 1600 px de large au plus, JPEG, sous la taille admise par la page. */
async function bannerFromFile(f: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(f.type)) throw new Error("Format accepté : JPEG, PNG ou WebP.");
  if (f.size > 15 * 1024 * 1024) throw new Error("Image trop lourde (15 Mo au plus).");
  const url = URL.createObjectURL(f);
  try {
    const img = new Image(); await new Promise<void>((ok, ko) => { img.onload = () => ok(); img.onerror = () => ko(new Error("Image illisible.")); img.src = url; });
    for (const [w, q] of [[1600, 0.82], [1400, 0.75], [1200, 0.7], [1000, 0.65]] as const) {
      const k = Math.min(1, w / img.naturalWidth), c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height); const data = c.toDataURL("image/jpeg", q);
      if (data.length <= MAX_IMAGE_CHARS) return data;
    }
    throw new Error("Image trop détaillée : essayez une image plus petite.");
  } finally { URL.revokeObjectURL(url); }
}

export function PageDesigner({ ev, save }: { ev: EventModel; save: (fn: (e: EventModel) => EventModel) => void }) {
  const { user } = useAuth();
  const allowed = canEditEventPage(ev, user ? { id: user.id, email: user.email } : null);
  const design = useMemo(() => normalizeDesign(ev.page), [ev.page]);
  const routes = useAllRoutes();
  const [device, setDevice] = useState<"ordinateur" | "mobile">("ordinateur");
  const [err, setErr] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState<BlockKind | "">("");

  if (!allowed) return <p className="flex items-start gap-2 rounded-2xl bg-white p-4 text-sm text-ink-700 ring-1 ring-ink-100" data-page-locked><Lock className="mt-0.5 size-4 shrink-0" />Réservé aux administrateurs du trail.</p>;
  const set = (fn: (d: EventPageDesign) => EventPageDesign) => save((e) => ({ ...e, page: { ...fn(normalizeDesign(e.page) ?? defaultDesign()), updatedAt: Date.now() } }));
  const theme = (p: Partial<PageTheme>) => set((d) => ({ ...d, theme: { ...d.theme, ...p } }));

  if (!design) return (
    <div className="grid gap-3 rounded-2xl bg-white p-5 ring-1 ring-ink-100" data-page-designer="off">
      <p className="text-sm text-ink-700">Votre page utilise la mise en page standard. Personnalisez-la : couleurs, bandeau, blocs et leur ordre. Elle sera propre à cet événement.</p>
      <div className="flex flex-wrap gap-2"><Button variant="brand" onClick={() => set((d) => d)} data-action="personnaliser"><Plus className="size-4" />Personnaliser la page</Button><Link href={eventHref(ev.id)} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-ink-200 px-4 text-sm font-semibold hover:bg-ink-50"><ExternalLink className="size-4" />Voir la page actuelle</Link></div>
    </div>
  );

  const t = design.theme;
  const seg = (on: boolean) => clsx("flex-1 rounded-lg px-2 py-1.5 text-sm font-semibold transition", on ? "bg-white text-ink-900 shadow" : "text-ink-600 hover:text-ink-900");
  const routeOf = (rid?: string) => (rid ? routes.find((r) => r.id === rid) ?? null : null);
  const upload = async (f: File | undefined) => { if (!f) return; setErr(null); try { const data = await bannerFromFile(f); theme({ bannerImage: data, banner: "image" }); } catch (e) { setErr((e as Error).message); } finally { if (file.current) file.current.value = ""; } };

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]" data-page-designer="on">
      <div className="grid min-w-0 content-start gap-4">
        {/* Identité visuelle */}
        <section className="grid gap-3 rounded-2xl bg-white p-4 ring-1 ring-ink-100">
          <h3 className="font-bold">Identité visuelle</h3>
          <div><p className="mb-1.5 text-xs font-semibold text-ink-500">Palettes</p>
            <div className="flex flex-wrap gap-1.5">{PRESETS.map((p) => <button key={p.id} type="button" onClick={() => theme({ primary: p.primary, accent: p.accent })} aria-pressed={t.primary === p.primary && t.accent === p.accent} data-preset={p.id} className={clsx("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold", t.primary === p.primary && t.accent === p.accent ? "border-ink-900" : "border-ink-200")}><i className="size-3.5 rounded-full" style={{ background: `linear-gradient(135deg, ${p.primary} 50%, ${p.accent} 50%)` }} />{p.label}</button>)}</div></div>
          <div className="grid grid-cols-2 gap-2">
            {([["primary", "Couleur principale"], ["accent", "Couleur secondaire"]] as const).map(([k, l]) => <label key={k} className="grid gap-1 text-xs font-semibold text-ink-600">{l}<span className="flex h-10 items-center gap-2 rounded-lg border border-ink-200 px-2"><input type="color" value={t[k]} onChange={(e) => theme({ [k]: e.target.value })} aria-label={l} data-color={k} className="size-7 cursor-pointer rounded border-0 bg-transparent p-0" /><span className="font-mono text-xs text-ink-700">{t[k]}</span></span></label>)}
          </div>
          <div><p className="mb-1 text-xs font-semibold text-ink-500">Fond de page</p><div className="flex gap-1 rounded-xl bg-ink-100 p-1" role="group" aria-label="Fond de page">{([["clair", "Clair"], ["teinte", "Teinté"], ["sombre", "Sombre"]] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={t.background === k} onClick={() => theme({ background: k })} className={seg(t.background === k)} data-bg={k}>{l}</button>)}</div></div>
          <div><p className="mb-1 text-xs font-semibold text-ink-500">Bandeau</p><div className="flex gap-1 rounded-xl bg-ink-100 p-1" role="group" aria-label="Bandeau">{([["degrade", "Dégradé"], ["uni", "Uni"], ["image", "Image"]] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={t.banner === k} onClick={() => (k === "image" && !t.bannerImage ? file.current?.click() : theme({ banner: k }))} className={seg(t.banner === k)} data-banner={k}>{l}</button>)}</div>
            <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => upload(e.target.files?.[0])} data-banner-file />
            <div className="mt-2 flex flex-wrap items-center gap-2"><Button size="sm" variant="secondary" onClick={() => file.current?.click()}><ImagePlus className="size-4" />{t.bannerImage ? "Changer l'image" : "Choisir une image"}</Button>{t.bannerImage && <Button size="sm" variant="ghost" onClick={() => theme({ bannerImage: undefined, banner: t.banner === "image" ? "degrade" : t.banner })}><Trash2 className="size-4" />Retirer</Button>}</div>
            {t.banner === "image" && t.bannerImage && <label className="mt-2 grid gap-1 text-xs font-semibold text-ink-600">Cadrage vertical<input type="range" min={0} max={100} value={t.bannerFocus ?? 50} onChange={(e) => theme({ bannerFocus: Number(e.target.value) })} /></label>}
            {err && <p role="alert" className="mt-2 text-xs text-danger">{err}</p>}</div>
          <p className="text-[11px] text-ink-500">Le texte reste lisible : sa couleur s&apos;adapte automatiquement aux couleurs choisies.</p>
        </section>

        {/* Blocs */}
        <section className="grid gap-2 rounded-2xl bg-white p-4 ring-1 ring-ink-100">
          <h3 className="font-bold">Blocs de la page</h3>
          <ol className="grid gap-2" data-blocks>{design.blocks.map((b, i) => (
            <li key={b.id} data-block={b.kind} className={clsx("rounded-xl border p-2.5", b.hidden ? "border-dashed border-ink-200 bg-ink-50/60" : "border-ink-200")}>
              <div className="flex items-center gap-1.5">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ink-900 text-[11px] font-bold text-white">{i + 1}</span>
                <p className={clsx("min-w-0 flex-1 truncate text-sm font-semibold", b.hidden && "text-ink-400 line-through")}>{b.title?.trim() || BLOCKS[b.kind].label}</p>
                <button type="button" aria-label={`Monter ${BLOCKS[b.kind].label}`} disabled={i === 0} onClick={() => set((d) => moveBlock(d, b.id, -1))} className="grid size-8 place-items-center rounded-lg hover:bg-ink-100 disabled:opacity-30"><ArrowUp className="size-4" /></button>
                <button type="button" aria-label={`Descendre ${BLOCKS[b.kind].label}`} disabled={i === design.blocks.length - 1} onClick={() => set((d) => moveBlock(d, b.id, 1))} className="grid size-8 place-items-center rounded-lg hover:bg-ink-100 disabled:opacity-30"><ArrowDown className="size-4" /></button>
                <button type="button" aria-label={b.hidden ? `Afficher ${BLOCKS[b.kind].label}` : `Masquer ${BLOCKS[b.kind].label}`} aria-pressed={!b.hidden} onClick={() => set((d) => patchBlock(d, b.id, { hidden: !b.hidden }))} className="grid size-8 place-items-center rounded-lg hover:bg-ink-100">{b.hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
                <button type="button" aria-label={`Retirer ${BLOCKS[b.kind].label}`} onClick={() => set((d) => removeBlock(d, b.id))} className="grid size-8 place-items-center rounded-lg text-danger hover:bg-danger/10"><Trash2 className="size-4" /></button>
              </div>
              {(b.kind === "texte" || b.kind === "inscription") && <div className="mt-2 grid gap-1.5">
                <input aria-label="Titre du bloc" value={b.title ?? ""} placeholder={BLOCKS[b.kind].label} onChange={(e) => set((d) => patchBlock(d, b.id, { title: e.target.value }))} className="h-9 rounded-lg border border-ink-200 px-2 text-sm" />
                <textarea aria-label="Texte du bloc" value={b.text ?? ""} rows={b.kind === "texte" ? 4 : 2} placeholder={b.kind === "texte" ? "Programme, partenaires, accès…" : "Message (facultatif)"} onChange={(e) => set((d) => patchBlock(d, b.id, { text: e.target.value }))} className="rounded-lg border border-ink-200 px-2 py-1.5 text-sm" />
              </div>}
              {["presentation", "pratique", "reglement"].includes(b.kind) && <p className="mt-1 pl-7 text-[11px] text-ink-500">Contenu repris de « Mon événement » et des documents.</p>}
            </li>))}</ol>
          {addable(design).length > 0 && <div className="mt-1 flex gap-2"><select aria-label="Bloc à ajouter" value={adding} onChange={(e) => setAdding(e.target.value as BlockKind)} className="h-10 w-0 min-w-0 flex-1 rounded-lg border border-ink-200 bg-white px-2 text-sm"><option value="">Ajouter un bloc…</option>{addable(design).map((k) => <option key={k} value={k} title={BLOCKS[k].hint}>{BLOCKS[k].label}</option>)}</select><Button variant="secondary" disabled={!adding} onClick={() => { if (adding) { set((d) => addBlock(d, adding)); setAdding(""); } }} data-action="ajouter-bloc"><Plus className="size-4" />Ajouter</Button></div>}
          {adding && <p className="text-[11px] text-ink-500">{BLOCKS[adding].hint}</p>}
        </section>
        <div className="flex flex-wrap gap-2">
          <Link href={eventHref(ev.id)} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-ink-950 px-4 text-sm font-semibold text-white hover:bg-ink-800"><ExternalLink className="size-4" />Voir la page publique</Link>
          <Button variant="ghost" onClick={() => { if (confirm("Revenir à la page standard ? Vos couleurs, image et blocs seront retirés.")) save((e) => { const { page: _p, ...rest } = e; void _p; return rest as EventModel; }); }} data-action="page-standard"><RotateCcw className="size-4" />Page standard</Button>
        </div>
      </div>

      {/* Aperçu en direct */}
      <div className="min-w-0">
        <div className="mb-2 flex items-center justify-between gap-2"><p className="text-sm font-semibold text-ink-600">Aperçu</p>
          <div className="flex gap-1 rounded-xl bg-ink-100 p-1" role="group" aria-label="Taille de l'aperçu">{([["ordinateur", Monitor], ["mobile", Smartphone]] as const).map(([k, I]) => <button key={k} type="button" aria-pressed={device === k} aria-label={`Aperçu ${k}`} onClick={() => setDevice(k)} className={clsx("grid h-8 w-10 place-items-center rounded-lg", device === k ? "bg-white shadow" : "text-ink-500")}><I className="size-4" /></button>)}</div></div>
        <div className="overflow-hidden rounded-2xl bg-ink-200/60 p-2 ring-1 ring-ink-100">
          <div className={clsx("mx-auto max-h-[44rem] overflow-y-auto overflow-x-hidden rounded-xl bg-white shadow", device === "mobile" ? "w-[23rem] max-w-full" : "w-full")} data-page-preview>
            <DesignedEventPage ev={ev} design={design} routeOf={routeOf} url={/^https?:\/\//i.test(ev.registrationUrl) ? ev.registrationUrl : null} collectionId={ev.collectionId} canEdit dl={() => {}} preview />
          </div>
        </div>
      </div>
    </div>
  );
}
