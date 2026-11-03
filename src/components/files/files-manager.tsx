"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { Upload, Download, Share2, Trash2, Pencil, X, Check, AlertTriangle, FileUp, Loader2 } from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RouteMap } from "@/components/map/route-map";
import { routesRepo } from "@/lib/repo";
import { fromSaved } from "@/lib/route-model";
import { FORMATS, parseAny, serialize, download, safeName, GpsFileError, MAX_BYTES, type GpsFormat, type ParsedFile } from "@/lib/formats";
import { fromTrack } from "@/lib/editor-core";
import { addElevation } from "@/lib/ign";
import { trackStats, fmtKm, fmtM } from "@/lib/geo";
import { uid, type Pt } from "@/lib/types";

interface Pending { key: string; file: string; parsed?: ParsedFile; coords?: Pt[]; error?: string; busy: boolean; note?: string }

export function FilesManager() {
  const mine = routesRepo.useAll();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [drag, setDrag] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handle(files: FileList | File[]) {
    for (const f of Array.from(files)) {
      const key = uid();
      const base: Pending = { key, file: f.name, busy: true };
      setPending((p) => [base, ...p]);
      const patch = (x: Partial<Pending>) => setPending((p) => p.map((i) => (i.key === key ? { ...i, ...x } : i)));
      if (f.size > MAX_BYTES) { patch({ busy: false, error: "Fichier trop volumineux (25 Mo max)." }); continue; }
      try {
        const parsed = parseAny(await f.text(), f.name);
        let coords = parsed.coords; let note: string | undefined;
        if (!parsed.hadElevation) {
          try { coords = await addElevation(parsed.coords.map((c) => [c[0], c[1]] as [number, number])); note = "Altitudes calculées via l'IGN (absentes du fichier)."; }
          catch { note = "Altitudes IGN indisponibles : le parcours est enregistré sans relief fiable."; }
        }
        patch({ parsed, coords, busy: false, note });
      } catch (e) { patch({ busy: false, error: e instanceof GpsFileError ? e.message : "Lecture du fichier impossible." }); }
    }
  }

  const save = (p: Pending) => {
    if (!p.parsed || !p.coords) return;
    const st = fromTrack(p.coords, p.parsed.pois);
    const now = Date.now();
    const res = routesRepo.upsert({ id: uid(), name: p.parsed.name, description: "", sport: "trail", segs: st.segs, waypoints: st.waypoints, coords: p.coords, pois: st.pois, terrain: [], visibility: "prive", region: "", country: "", source: "import", fileName: p.file, createdAt: now, updatedAt: now });
    if (res.ok) { setPending((x) => x.filter((i) => i.key !== p.key)); setMsg(`« ${p.parsed.name} » enregistré.`); } else setMsg(res.error ?? "Enregistrement impossible.");
  };

  const exportOne = (id: string, f: GpsFormat) => { const r = routesRepo.get(id); if (r) download(`${safeName(r.name)}.${FORMATS[f].ext}`, serialize(f, { name: r.name, description: r.description, coords: r.coords, pois: r.pois }), FORMATS[f].mime); };
  const share = async (id: string) => {
    const r = routesRepo.get(id); if (!r) return;
    const file = new File([serialize("gpx", { name: r.name, coords: r.coords, pois: r.pois })], `${safeName(r.name)}.gpx`, { type: FORMATS.gpx.mime });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ title: r.name, files: [file] }); } catch { /* annulé */ } }
    else { download(file.name, file, FORMATS.gpx.mime); setMsg("Le partage direct n'est pas disponible ici : le fichier GPX a été téléchargé, envoyez-le comme vous le souhaitez."); }
  };
  const rename = (id: string) => { const r = routesRepo.get(id); if (!r) return; const n = prompt("Nouveau nom", r.name); if (n?.trim()) routesRepo.upsert({ ...r, name: n.trim(), updatedAt: Date.now() }); };
  const del = (id: string) => { const r = routesRepo.get(id); if (r && confirm(`Supprimer « ${r.name} » de cet appareil ?`)) routesRepo.remove(id); };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-extrabold sm:text-4xl">Mes fichiers GPS</h1>
      <p className="mt-2 max-w-2xl text-ink-600">Importez, vérifiez, convertissez et exportez vos traces (GPX, KML, GeoJSON, TCX). Tout est stocké sur cet appareil.</p>

      <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files); }}
        className={clsx("mt-6 grid place-items-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition", drag ? "border-pine-500 bg-pine-50" : "border-ink-200 bg-white")}>
        <FileUp className="size-8 text-pine-600" />
        <p className="font-medium">Glissez vos fichiers ici</p>
        <input ref={input} type="file" multiple accept=".gpx,.kml,.geojson,.json,.tcx" hidden onChange={(e) => { if (e.target.files) handle(e.target.files); e.target.value = ""; }} />
        <Button variant="brand" onClick={() => input.current?.click()}><Upload className="size-4" />Choisir des fichiers</Button>
      </div>
      {msg && <p role="status" className="mt-3 rounded-lg bg-pine-50 px-3 py-2 text-sm text-pine-700">{msg}</p>}

      {pending.length > 0 && (
        <section className="mt-8 grid gap-4" aria-label="Fichiers à valider">
          <h2 className="text-xl font-bold">À valider</h2>
          {pending.map((p) => (
            <article key={p.key} className="overflow-hidden rounded-2xl bg-white ring-1 ring-ink-100">
              <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-4 py-3">
                <div className="min-w-0"><p className="truncate font-semibold">{p.parsed?.name ?? p.file}</p><p className="truncate text-xs text-ink-500">{p.file}{p.parsed && <> · {FORMATS[p.parsed.format].label} · {p.parsed.coords.length.toLocaleString("fr-FR")} points</>}</p></div>
                <button aria-label="Écarter" className="grid size-8 place-items-center rounded hover:bg-ink-100" onClick={() => setPending((x) => x.filter((i) => i.key !== p.key))}><X className="size-4" /></button>
              </div>
              {p.busy && <p className="flex items-center gap-2 p-4 text-sm"><Loader2 className="size-4 animate-spin" />Vérification…</p>}
              {p.error && <p role="alert" className="flex items-start gap-2 p-4 text-sm text-danger"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{p.error}</p>}
              {p.parsed && p.coords && (() => { const s = trackStats(p.coords, 3); return (
                <div className="grid gap-4 p-4 md:grid-cols-[1fr_16rem]">
                  <RouteMap coords={p.coords} pois={p.parsed.pois} className="h-56" />
                  <div className="grid content-start gap-2 text-sm">
                    <p><b>{fmtKm(s.distanceM)}</b> · D+ <b>{fmtM(s.gainM)}</b> · D− <b>{fmtM(s.lossM)}</b></p>
                    <p>Altitude {fmtM(s.minEle)} → {fmtM(s.maxEle)} · {p.parsed.pois.length} point(s) d'intérêt</p>
                    {p.note && <p className="text-xs text-ink-500">{p.note}</p>}
                    {p.parsed.warnings.map((w) => <p key={w} className="flex gap-1.5 text-xs text-warn"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{w}</p>)}
                    <div className="mt-2 flex gap-2"><Button size="sm" variant="brand" onClick={() => save(p)}><Check className="size-4" />Enregistrer</Button><Button size="sm" variant="secondary" onClick={() => setPending((x) => x.filter((i) => i.key !== p.key))}>Écarter</Button></div>
                  </div>
                </div>); })()}
            </article>
          ))}
        </section>
      )}

      <section className="mt-10" aria-label="Fichiers enregistrés">
        <h2 className="text-xl font-bold">Enregistrés ({mine.length})</h2>
        {!mine.length ? <p className="mt-3 rounded-xl border border-dashed border-ink-200 p-6 text-sm text-ink-500">Aucun parcours enregistré. Importez un fichier ou <Link className="font-semibold text-pine-700 underline" href="/creer">créez un parcours</Link>.</p> : (
          <ul className="mt-3 grid gap-3">
            {mine.map((r) => { const v = fromSaved(r); return (
              <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-ink-100">
                <div className="min-w-0 flex-1">
                  <Link href={`/parcours/${r.id}`} className="block truncate font-semibold hover:text-pine-700">{r.name}</Link>
                  <p className="text-xs text-ink-500">{fmtKm(v.stats.distanceM)} · {fmtM(v.stats.gainM)} D+ · {r.coords.length} pts · <Badge tone={r.source === "import" ? "glacier" : "pine"}>{r.source === "import" ? `Importé${r.fileName ? " : " + r.fileName : ""}` : "Créé ici"}</Badge></p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(Object.keys(FORMATS) as GpsFormat[]).map((f) => <Button key={f} size="sm" variant="secondary" onClick={() => exportOne(r.id, f)} title={`Convertir et télécharger en ${FORMATS[f].label}`}><Download className="size-3.5" />{FORMATS[f].label}</Button>)}
                  <Button size="sm" variant="ghost" onClick={() => share(r.id)} aria-label="Partager"><Share2 className="size-4" /></Button>
                  <Link href={`/creer?id=${r.id}`} className="grid size-9 place-items-center rounded-lg text-ink-700 hover:bg-ink-100" aria-label="Modifier dans l'éditeur" title="Modifier"><Pencil className="size-4" /></Link>
                  <Button size="sm" variant="ghost" onClick={() => rename(r.id)}>Renommer</Button>
                  <Button size="sm" variant="ghost" onClick={() => del(r.id)} aria-label="Supprimer"><Trash2 className="size-4" /></Button>
                </div>
              </li>); })}
          </ul>
        )}
      </section>
    </div>
  );
}
