"use client";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Heart, Navigation, Download, Share2, Pencil, Flag, Star, MapPin, Copy, Camera, Trash2, ExternalLink, ImageDown, FileText, BadgeCheck, ArrowLeft } from "lucide-react";
import clsx from "clsx";
import { RouteMap } from "@/components/map/route-map";
import { ElevationChart, type ChartMarker } from "./elevation-chart";
import { Button } from "@/components/ui/button";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { useAllRoutes, useVerified } from "@/lib/route-vm";
import { routesRepo, reviewsRepo, reportsRepo, useFavorites, toggleFavorite } from "@/lib/repo";
import { usePhotos, addPhoto, removePhoto } from "@/lib/photos";
import { buildProfile, distanceAlong } from "@/lib/profile";
import { cumulative, fmtKm, fmtM, fmtDuration } from "@/lib/geo";
import { SPORTS, DIFFICULTY_LABEL } from "@/lib/sports";
import { POI_TYPES, uid } from "@/lib/types";
import { FORMATS, serialize, download, safeName, type GpsFormat } from "@/lib/formats";
import { chartToPng, chartToPdf } from "@/lib/export-profile";

export function RoutePage({ id }: { id: string }) {
  const all = useAllRoutes();
  const route = all.find((r) => r.id === id);
  const favs = useFavorites();
  const verified = useVerified();
  const photos = usePhotos(id);
  const reviews = reviewsRepo.useAll().filter((r) => r.routeId === id);
  const chartRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [reporting, setReporting] = useState(false);
  const [report, setReport] = useState("");
  const fileIn = useRef<HTMLInputElement>(null);

  const profile = useMemo(() => (route ? buildProfile(route.coords) : []), [route]);
  const cum = useMemo(() => (route ? cumulative(route.coords) : []), [route]);
  const markers: ChartMarker[] = useMemo(() => {
    if (!route) return [];
    const ms: ChartMarker[] = route.pois.map((p) => ({ d: distanceAlong(route.coords, cum, p), label: POI_TYPES[p.type].letter, color: POI_TYPES[p.type].color, title: `${p.name} (${POI_TYPES[p.type].label})` }));
    route.waypoints.slice(1, -1).forEach((w, i) => ms.push({ d: distanceAlong(route.coords, cum, w), label: String(i + 1), color: "#36504a", title: `Point de passage ${i + 1}` }));
    return ms;
  }, [route, cum]);

  if (!route) return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center"><h1 className="text-3xl font-bold">Parcours introuvable</h1><p className="mt-3 text-ink-600">Ce parcours n'existe pas sur cet appareil. Les parcours enregistrés sont locaux à votre navigateur.</p><Link href="/parcours" className="mt-6 inline-block font-semibold text-pine-700 underline">Retour à la bibliothèque</Link></div>
  );

  const mine = route.origin === "mine";
  const isFav = favs.includes(route.id);
  const s = route.stats;
  const avg = reviews.length ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length : 0;
  const start = route.coords[0];
  const exp = (f: GpsFormat) => download(`${safeName(route.name)}.${FORMATS[f].ext}`, serialize(f, { name: route.name, description: route.description, coords: route.coords, pois: route.pois }), FORMATS[f].mime);
  const share = async () => {
    const file = new File([serialize("gpx", { name: route.name, coords: route.coords, pois: route.pois })], `${safeName(route.name)}.gpx`, { type: FORMATS.gpx.mime });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ title: route.name, text: `${route.name} — ${fmtKm(s.distanceM)}, ${fmtM(s.gainM)} D+`, files: [file] }); } catch { /* annulé */ } }
    else { download(file.name, file, FORMATS.gpx.mime); setMsg("Partage direct indisponible ici : le GPX a été téléchargé. Les parcours sont stockés sur cet appareil, il n'existe pas encore de lien public."); }
  };
  const exportChart = async (kind: "png" | "pdf") => {
    if (!chartRef.current) return;
    try {
      if (kind === "png") download(`${safeName(route.name)}-profil.png`, await chartToPng(chartRef.current), "image/png");
      else download(`${safeName(route.name)}-profil.pdf`, await chartToPdf(chartRef.current, { title: route.name, lines: [`Distance ${fmtKm(s.distanceM)} · D+ ${fmtM(s.gainM)} · D- ${fmtM(s.lossM)}`, `Altitude ${fmtM(s.minEle)} - ${fmtM(s.maxEle)} · ${SPORTS[route.sport].label} · durée estimée ${fmtDuration(route.durationMin)}`] }), "application/pdf");
    } catch { setMsg("Export du profil impossible."); }
  };
  const sendReview = () => { if (!rating) { setMsg("Choisissez une note de 1 à 5."); return; } reviewsRepo.upsert({ id: uid(), routeId: route.id, rating, comment: comment.trim(), at: Date.now() }); setRating(0); setComment(""); setMsg("Avis enregistré sur cet appareil."); };
  const sendReport = () => { if (!report.trim()) return; reportsRepo.upsert({ id: uid(), routeId: route.id, routeName: route.name, message: report.trim(), at: Date.now(), status: "ouvert" }); setReport(""); setReporting(false); setMsg("Signalement enregistré : il apparaît dans l'administration."); };
  const del = () => { if (confirm(`Supprimer « ${route.name} » ?`)) { routesRepo.remove(route.id); location.assign("/parcours"); } };
  const upPhoto = async (f?: File) => { if (!f) return; const r = await addPhoto(route.id, f); if (!r.ok) setMsg(r.error ?? "Ajout impossible."); };

  const Stat = ({ l, v }: { l: string; v: string }) => <div className="rounded-xl bg-white p-4 ring-1 ring-ink-100"><dt className="text-[11px] font-medium uppercase tracking-wide text-ink-400">{l}</dt><dd className="mt-0.5 font-display text-xl font-bold">{v}</dd></div>;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link href="/parcours" className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900"><ArrowLeft className="size-4" />Bibliothèque</Link>
      <header className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap gap-1.5"><Badge tone="pine">{SPORTS[route.sport].label}</Badge>{route.origin === "demo" && <DemoBadge />}{verified.includes(route.id) && <Badge tone="glacier"><BadgeCheck className="size-3" />Officiel vérifié</Badge>}{mine && <Badge>{route.visibility === "prive" ? "Privé" : "Public (local)"}</Badge>}{route.loop && <Badge>Boucle</Badge>}</div>
          <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">{route.name}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-ink-600"><MapPin className="size-4" />{[route.region, route.country].filter(Boolean).join(", ") || "Lieu non renseigné"}{reviews.length > 0 && <span className="ml-3 inline-flex items-center gap-1"><Star className="size-4 fill-ember-400 text-ember-400" />{avg.toFixed(1).replace(".", ",")} ({reviews.length})</span>}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={isFav ? "primary" : "secondary"} aria-pressed={isFav} onClick={() => toggleFavorite(route.id)}><Heart className={clsx("size-4", isFav && "fill-current")} />{isFav ? "Favori" : "Ajouter aux favoris"}</Button>
          <Link href={`/suivi?route=${route.id}`} className="inline-flex h-11 items-center gap-2 rounded-xl border border-ink-200 bg-white px-5 text-[15px] font-semibold hover:bg-ink-50"><Navigation className="size-4" />Suivre</Link>
          <Button variant="secondary" onClick={() => exp("gpx")}><Download className="size-4" />GPX</Button>
          <Button variant="secondary" onClick={share}><Share2 className="size-4" />Partager</Button>
          {mine && <Link href={`/creer?id=${route.id}`} className="inline-flex h-11 items-center gap-2 rounded-xl bg-pine-600 px-5 text-[15px] font-semibold text-white hover:bg-pine-700"><Pencil className="size-4" />Modifier</Link>}
        </div>
      </header>
      {msg && <p role="status" className="mt-4 rounded-lg bg-pine-50 px-3 py-2 text-sm text-pine-700">{msg}</p>}

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <Stat l="Distance" v={fmtKm(s.distanceM)} /><Stat l="D+" v={fmtM(s.gainM)} /><Stat l="D−" v={fmtM(s.lossM)} /><Stat l="Difficulté" v={DIFFICULTY_LABEL[route.difficulty]} />
        <Stat l="Alt. min" v={fmtM(s.minEle)} /><Stat l="Alt. max" v={fmtM(s.maxEle)} /><Stat l="Durée est." v={fmtDuration(route.durationMin)} /><Stat l="Terrain" v={route.terrain.length ? route.terrain.join(", ") : "—"} />
      </dl>

      <div className="mt-6"><RouteMap coords={route.coords} pois={route.pois} activeIndex={hover} onTrackHover={setHover} className="h-[26rem]" /></div>

      <section className="mt-6 rounded-2xl bg-white p-4 ring-1 ring-ink-100" aria-label="Profil altimétrique">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold">Profil altimétrique</h2>
          <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => exportChart("png")}><ImageDown className="size-4" />Image</Button><Button size="sm" variant="secondary" onClick={() => exportChart("pdf")}><FileText className="size-4" />PDF</Button></div></div>
        <ElevationChart ref={chartRef} points={profile} markers={markers} onHover={setHover} height={260} />
        <p className="mt-1 text-xs text-ink-400">Survolez le profil ou la trace pour voir la position correspondante. Pente calculée sur environ 100 m.</p>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="grid content-start gap-6">
          <section className="rounded-2xl bg-white p-5 ring-1 ring-ink-100"><h2 className="text-lg font-bold">Description</h2><p className="mt-2 whitespace-pre-line text-ink-700">{route.description || "Aucune description."}</p></section>
          <section className="rounded-2xl bg-white p-5 ring-1 ring-ink-100"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">Photographies</h2>
            {mine && <><input ref={fileIn} type="file" accept="image/*" hidden onChange={(e) => { upPhoto(e.target.files?.[0]); e.target.value = ""; }} /><Button size="sm" variant="secondary" onClick={() => fileIn.current?.click()}><Camera className="size-4" />Ajouter</Button></>}</div>
            {photos.length ? <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{photos.map((p, i) => <li key={i} className="group relative overflow-hidden rounded-lg">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={p} alt={`Photo ${i + 1} de ${route.name}`} className="aspect-[4/3] w-full object-cover" />{mine && <button aria-label="Supprimer la photo" onClick={() => removePhoto(route.id, i)} className="absolute right-1 top-1 grid size-7 place-items-center rounded bg-black/60 text-white opacity-0 focus:opacity-100 group-hover:opacity-100"><Trash2 className="size-4" /></button>}</li>)}</ul>
              : <p className="mt-2 text-sm text-ink-500">{mine ? "Ajoutez vos photos (stockées sur cet appareil)." : "Pas de photographie pour les parcours de démonstration."}</p>}</section>
          <section className="rounded-2xl bg-white p-5 ring-1 ring-ink-100"><h2 className="text-lg font-bold">Avis et notes</h2>
            <div className="mt-3 flex items-center gap-1" role="radiogroup" aria-label="Note">{[1, 2, 3, 4, 5].map((n) => <button key={n} role="radio" aria-checked={rating === n} aria-label={`${n} étoile${n > 1 ? "s" : ""}`} onClick={() => setRating(n)}><Star className={clsx("size-7", n <= rating ? "fill-ember-400 text-ember-400" : "text-ink-300")} /></button>)}</div>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Votre commentaire (optionnel)" rows={3} maxLength={1000} className="mt-3 w-full rounded-lg border border-ink-200 p-3 text-sm" />
            <Button className="mt-2" size="sm" variant="brand" onClick={sendReview}>Publier mon avis</Button>
            <ul className="mt-4 grid gap-3">{reviews.sort((a, b) => b.at - a.at).map((r) => <li key={r.id} className="rounded-lg bg-ink-50 p-3 text-sm"><div className="flex items-center justify-between"><span className="flex">{Array.from({ length: r.rating }).map((_, i) => <Star key={i} className="size-3.5 fill-ember-400 text-ember-400" />)}</span><button className="text-xs text-ink-400 hover:text-danger" onClick={() => reviewsRepo.remove(r.id)}>Supprimer</button></div>{r.comment && <p className="mt-1">{r.comment}</p>}<p className="mt-1 text-xs text-ink-400">{new Date(r.at).toLocaleDateString("fr-FR")}</p></li>)}</ul>
            <p className="mt-2 text-xs text-ink-400">Les avis sont enregistrés sur cet appareil.</p></section>
        </div>
        <div className="grid content-start gap-6">
          <section className="rounded-2xl bg-white p-5 ring-1 ring-ink-100"><h2 className="text-lg font-bold">Informations pratiques</h2>
            <dl className="mt-3 grid gap-2 text-sm"><div><dt className="text-ink-400">Départ</dt><dd className="font-medium">{start[1].toFixed(5)}, {start[0].toFixed(5)} · {fmtM(start[2])}</dd></div><div><dt className="text-ink-400">Type</dt><dd className="font-medium">{route.loop ? "Boucle" : "Aller simple"}</dd></div><div><dt className="text-ink-400">Durée estimée</dt><dd className="font-medium">{fmtDuration(route.durationMin)} (estimation, non contractuelle)</dd></div></dl>
            <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => { navigator.clipboard?.writeText(`${start[1].toFixed(5)}, ${start[0].toFixed(5)}`); setMsg("Coordonnées copiées."); }}><Copy className="size-4" />Copier</Button>
              <a className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3.5 text-sm font-semibold hover:bg-ink-50" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/directions?to=${start[1]},${start[0]}`}><ExternalLink className="size-4" />Itinéraire d'accès</a></div></section>
          <section className="rounded-2xl bg-white p-5 ring-1 ring-ink-100"><h2 className="text-lg font-bold">Points d'intérêt</h2>
            {route.pois.length ? <ul className="mt-3 grid gap-2">{route.pois.map((p) => <li key={p.id} className="flex items-center gap-2 text-sm"><span className="grid size-6 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: POI_TYPES[p.type].color }}>{POI_TYPES[p.type].letter}</span><span className="flex-1">{p.name}</span><span className="text-ink-400">km {(distanceAlong(route.coords, cum, p) / 1000).toFixed(1).replace(".", ",")}</span></li>)}</ul> : <p className="mt-2 text-sm text-ink-500">Aucun point d'intérêt renseigné.</p>}</section>
          <section className="rounded-2xl bg-white p-5 ring-1 ring-ink-100"><h2 className="text-lg font-bold">Télécharger</h2><div className="mt-3 grid grid-cols-2 gap-2">{(Object.keys(FORMATS) as GpsFormat[]).map((f) => <Button key={f} size="sm" variant="secondary" onClick={() => exp(f)}><Download className="size-4" />{FORMATS[f].label}</Button>)}</div></section>
          <section className="rounded-2xl bg-white p-5 ring-1 ring-ink-100">
            <Button size="sm" variant="ghost" onClick={() => setReporting(!reporting)}><Flag className="size-4" />Signaler une erreur</Button>
            {reporting && <div className="mt-2 grid gap-2"><textarea value={report} onChange={(e) => setReport(e.target.value)} rows={3} placeholder="Décrivez le problème (tracé, point, description…)" className="rounded-lg border border-ink-200 p-3 text-sm" /><Button size="sm" variant="brand" onClick={sendReport}>Envoyer</Button></div>}
            {mine && <Button size="sm" variant="ghost" className="text-danger" onClick={del}><Trash2 className="size-4" />Supprimer ce parcours</Button>}
          </section>
        </div>
      </div>
    </div>
  );
}
