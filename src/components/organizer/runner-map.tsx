"use client";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Eye, EyeOff, ImagePlus, Trash2, ExternalLink, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RouteMap } from "@/components/map/route-map";
import { routesRepo } from "@/lib/repo";
import { eventHref } from "@/lib/url";
import { POST_KINDS, postNumbers, postRaceIds, type EventModel, type PostKind } from "@/lib/events";
import { INTERNAL_KINDS, MAX_MAP_IMAGE_CHARS, SETTABLE_KINDS, isPublic, kindsOf, poisOf, runnerMap, toggleKind, togglePost, type PublicMapSettings } from "@/lib/public-map";
import { imageToDataUrl } from "@/lib/image-resize";
import { PostIcon } from "./logistics";

/**
 * Carte des coureurs : ce que voient les participants sur la page publique.
 * Indépendante de la préparation : on choisit ce qui est montré, les postes de la logistique ne changent jamais.
 */
export function RunnerMapPanel({ ev, save }: { ev: EventModel; save: (fn: (e: EventModel) => EventModel) => void }) {
  const routes = routesRepo.useAll();
  const s = ev.publicMap;
  const set = (fn: (x: PublicMapSettings | undefined) => PublicMapSettings) => save((e) => ({ ...e, publicMap: fn(e.publicMap) }));
  const rm = useMemo(() => runnerMap(ev, (rid) => routes.find((r) => r.id === rid)?.pois ?? []), [ev, routes]);
  const [raceId, setRaceId] = useState(ev.races.find((r) => r.routeId)?.id ?? ev.races[0]?.id ?? "");
  const race = ev.races.find((r) => r.id === raceId), route = routes.find((r) => r.id === race?.routeId);
  const [err, setErr] = useState<string | null>(null); const file = useRef<HTMLInputElement>(null);
  const nums = postNumbers(ev), label = (id: string) => ev.races.find((r) => r.id === id)?.label ?? "";
  const posts = ev.posts.filter((p) => p.kind !== "depart" && p.kind !== "arrivee");
  const shown = posts.filter((p) => isPublic(p, s)).length, internalShown = posts.filter((p) => isPublic(p, s) && INTERNAL_KINDS.includes(p.kind)).length;
  const kinds = kindsOf(s);
  const upload = async (f?: File) => { if (!f) return; setErr(null); try { const image = await imageToDataUrl(f, { maxChars: MAX_MAP_IMAGE_CHARS, widths: [2000, 1600, 1400, 1200] }); set((x) => ({ ...(x ?? {}), image })); } catch (e) { setErr((e as Error).message); } finally { if (file.current) file.current.value = ""; } };

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[24rem_minmax(0,1fr)]" data-runner-map>
      <div className="grid min-w-0 content-start gap-4">
        <p className="flex items-start gap-2 rounded-2xl bg-pine-50 p-3 text-sm text-pine-900"><ShieldCheck className="mt-0.5 size-4 shrink-0" />Deux cartes indépendantes : la logistique garde tous ses postes ; ici, vous choisissez seulement ce que voient les coureurs.</p>

        <section className="grid gap-2 rounded-2xl bg-white p-4 ring-1 ring-ink-100">
          <h3 className="font-bold">Points montrés aux coureurs</h3>
          <ul className="grid gap-1.5" aria-label="Types de points">{SETTABLE_KINDS.map((k: PostKind) => { const on = kinds.includes(k), n = posts.filter((p) => p.kind === k).length, internal = INTERNAL_KINDS.includes(k); return (
            <li key={k}><label className={clsx("flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 ring-1", on ? "bg-white ring-ink-300" : "bg-ink-50 ring-ink-100")} data-kind={k}>
              <input type="checkbox" checked={on} onChange={() => set((x) => toggleKind(x, k))} className="size-4 accent-[var(--color-pine-600)]" />
              <PostIcon kind={k} size={22} /><span className="min-w-0 flex-1 text-sm font-semibold">{POST_KINDS[k].label}</span>
              {internal && <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-bold uppercase text-ink-600">interne</span>}
              <span className="text-xs text-ink-500">{n}</span></label></li>); })}</ul>
          <p className="text-[11px] text-ink-500">Départ et arrivée sont toujours indiqués par les drapeaux du tracé. Effectifs, bénévoles et consignes ne sont jamais publiés.</p>
          {internalShown > 0 && <p role="status" className="rounded-lg bg-warn/10 px-2 py-1.5 text-xs text-ink-700">{internalShown} point(s) interne(s) seront visibles des coureurs.</p>}
        </section>

        <section className="grid gap-2 rounded-2xl bg-white p-4 ring-1 ring-ink-100">
          <h3 className="font-bold">Carte importée <span className="text-xs font-normal text-ink-500">(facultatif)</span></h3>
          <p className="text-xs text-ink-500">Votre propre plan pour les coureurs (image JPEG, PNG ou WebP), affiché sur la page de l&apos;événement.</p>
          <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => upload(e.target.files?.[0])} data-runner-file />
          {s?.image ? <><img src={s.image} alt="Carte importée" className="max-h-56 w-full rounded-lg object-contain ring-1 ring-ink-100" />
            <input aria-label="Légende de la carte" value={s.caption ?? ""} onChange={(e) => set((x) => ({ ...(x ?? {}), caption: e.target.value.slice(0, 300) }))} placeholder="Légende (facultatif)" className="h-9 rounded-lg border border-ink-200 px-2 text-sm" />
            <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => file.current?.click()}><ImagePlus className="size-4" />Remplacer</Button><Button size="sm" variant="ghost" onClick={() => set((x) => { const { image: _i, caption: _c, ...rest } = x ?? {}; void _i; void _c; return rest; })}><Trash2 className="size-4" />Retirer</Button></div></>
            : <Button size="sm" variant="secondary" onClick={() => file.current?.click()} data-action="importer-carte"><ImagePlus className="size-4" />Importer une carte</Button>}
          {err && <p role="alert" className="text-xs text-danger">{err}</p>}
          <label className="mt-1 flex items-center gap-2 text-sm"><input type="checkbox" checked={s?.interactive !== false} onChange={(e) => set((x) => ({ ...(x ?? {}), interactive: e.target.checked }))} data-action="carte-interactive" />Afficher aussi la carte interactive de chaque course</label>
        </section>
        <Link href={eventHref(ev.id)} className="inline-flex h-10 w-fit items-center gap-1.5 rounded-xl bg-ink-950 px-4 text-sm font-semibold text-white hover:bg-ink-800"><ExternalLink className="size-4" />Voir la page publique</Link>
      </div>

      <div className="grid min-w-0 content-start gap-4">
        <section className="rounded-2xl bg-white p-4 ring-1 ring-ink-100">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">Aperçu coureurs</h3>
            {ev.races.length > 1 && <select aria-label="Course" value={raceId} onChange={(e) => setRaceId(e.target.value)} className="h-9 rounded-lg border border-ink-200 bg-white px-2 text-sm">{ev.races.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>}</div>
          {route ? <RouteMap coords={route.coords} pois={poisOf(rm, raceId)} className="h-[22rem]" title={`${race?.label} — vue coureurs`} /> : <p className="rounded-lg bg-ink-50 p-4 text-sm text-ink-500">Aucun parcours lié à cette course.</p>}
          <p className="mt-2 text-xs text-ink-500" data-runner-count>{rm.points.filter((p) => p.raceId === raceId).length} point(s) montré(s) sur cette course · {shown}/{posts.length} poste(s) publics au total.</p>
        </section>
        <section className="rounded-2xl bg-white p-4 ring-1 ring-ink-100">
          <h3 className="mb-2 font-bold">Poste par poste</h3>
          {!posts.length ? <p className="text-sm text-ink-500">Aucun poste : placez-les dans « Carte et postes ».</p> :
          <ul className="grid gap-1.5" data-runner-posts>{posts.map((p) => { const vis = isPublic(p, s); return (
            <li key={p.id} data-post={p.id} data-visible={vis ? "1" : "0"} className={clsx("flex items-center gap-2.5 rounded-xl px-2.5 py-2 ring-1", vis ? "ring-ink-200" : "bg-ink-50 ring-ink-100")}>
              <PostIcon kind={p.kind} size={22} />
              <span className="min-w-0 flex-1"><span className={clsx("block truncate text-sm font-semibold", !vis && "text-ink-500")}>{nums.get(p.id)?.n ? `${nums.get(p.id)!.n}. ` : ""}{p.name}</span><span className="block text-xs text-ink-500">{POST_KINDS[p.kind].label} · {postRaceIds(p).map(label).join(" + ")} · km {p.km.toFixed(1)}</span></span>
              <button type="button" onClick={() => set((x) => togglePost(x, p))} aria-pressed={vis} aria-label={vis ? `Masquer ${p.name} aux coureurs` : `Montrer ${p.name} aux coureurs`} className={clsx("inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold", vis ? "bg-pine-50 text-pine-700" : "bg-white text-ink-500 ring-1 ring-ink-200")}>{vis ? <Eye className="size-4" /> : <EyeOff className="size-4" />}{vis ? "Visible" : "Masqué"}</button>
            </li>); })}</ul>}
        </section>
      </div>
    </div>
  );
}
