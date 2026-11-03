"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { GeoJSONSource, Marker } from "maplibre-gl";
import { Play, Square, Pause, Navigation, AlertTriangle, ArrowUp, Smartphone, LocateFixed } from "lucide-react";
import clsx from "clsx";
import { useMap } from "@/components/map/use-map";
import { Button } from "@/components/ui/button";
import { useAllRoutes } from "@/lib/route-vm";
import { activitiesRepo } from "@/lib/repo";
import { HINT_LABEL, OffRouteDetector, acceptFix, angleDiff, bearing, cumOf, navigate, recordingStats, type Fix, type NavState } from "@/lib/navigation";
import { bboxOf, fmtKm, fmtM } from "@/lib/geo";
import { SPORTS, type Sport } from "@/lib/sports";
import { uid } from "@/lib/types";

const fmtT = (s: number) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function beep() {
  try { const A = window.AudioContext; const c = new A(); const o = c.createOscillator(); const g = c.createGain(); o.connect(g); g.connect(c.destination); o.frequency.value = 880; g.gain.value = 0.15; o.start(); o.stop(c.currentTime + 0.4); setTimeout(() => c.close(), 600); } catch { /* audio indisponible */ }
}

export function Tracker({ initialRouteId }: { initialRouteId?: string }) {
  const routes = useAllRoutes();
  const [routeId, setRouteId] = useState(initialRouteId ?? "");
  const route = routes.find((r) => r.id === routeId);
  const cum = useMemo(() => (route ? cumOf(route.coords) : []), [route]);
  const { el, map, ml, ready } = useMap();
  const [active, setActive] = useState(false);
  const [recording, setRecording] = useState(true);
  const [sport, setSport] = useState<Sport>("trail");
  const [err, setErr] = useState<string | null>(null);
  const [fixes, setFixes] = useState<Fix[]>([]);
  const [nav, setNav] = useState<NavState | null>(null);
  const [off, setOff] = useState(false);
  const [heading, setHeading] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [wake, setWake] = useState<"off" | "on" | "unsupported">("off");
  const [follow, setFollow] = useState(true);
  const [weak, setWeak] = useState(false);
  const watch = useRef<number | null>(null);
  const fixesRef = useRef<Fix[]>([]);
  const detector = useRef(new OffRouteDetector(40, 3));
  const lastIdx = useRef(0);
  const lock = useRef<{ release: () => Promise<void> } | null>(null);
  const me = useRef<Marker | null>(null);
  const recRef = useRef(recording); recRef.current = recording;
  const routeRef = useRef(route); routeRef.current = route;
  const cumRef = useRef(cum); cumRef.current = cum;
  const followRef = useRef(follow); followRef.current = follow;
  const wasOff = useRef(false);

  // trace du parcours suivi
  useEffect(() => {
    const m = map.current; if (!m || !ready) return;
    if (!m.getSource("fr")) {
      m.addSource("fr", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addSource("rec", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "fr-c", type: "line", source: "fr", paint: { "line-color": "#fff", "line-width": 8 }, layout: { "line-cap": "round", "line-join": "round" } });
      m.addLayer({ id: "fr-l", type: "line", source: "fr", paint: { "line-color": "#f0612b", "line-width": 5 }, layout: { "line-cap": "round", "line-join": "round" } });
      m.addLayer({ id: "rec-l", type: "line", source: "rec", paint: { "line-color": "#3ba6c9", "line-width": 4 }, layout: { "line-cap": "round", "line-join": "round" } });
      m.on("dragstart", () => setFollow(false));
    }
    (m.getSource("fr") as GeoJSONSource).setData({ type: "FeatureCollection", features: route ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: route.coords.map((c) => [c[0], c[1]]) } }] : [] });
    if (route) { const b = bboxOf(route.coords); m.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 50, maxZoom: 16, duration: 0 }); }
  }, [route, ready, map]);

  const onFix = useCallback((p: GeolocationPosition) => {
    const m = map.current, lib = ml.current;
    setWeak(false);
    const f: Fix = { lng: p.coords.longitude, lat: p.coords.latitude, ele: p.coords.altitude ?? 0, t: p.timestamp, acc: p.coords.accuracy };
    const prev = fixesRef.current[fixesRef.current.length - 1];
    let hd = p.coords.heading;
    if ((hd == null || Number.isNaN(hd)) && prev) hd = bearing([prev.lng, prev.lat], [f.lng, f.lat]);
    if (hd != null && !Number.isNaN(hd)) setHeading(hd);
    if (recRef.current && acceptFix(prev, f)) {
      fixesRef.current = [...fixesRef.current, f]; setFixes(fixesRef.current);
      (m?.getSource("rec") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: fixesRef.current.map((x) => [x.lng, x.lat]) } }] });
    }
    const r = routeRef.current;
    if (r && r.coords.length > 1) {
      const s = navigate(r.coords, cumRef.current, [f.lng, f.lat], lastIdx.current);
      lastIdx.current = s.index; setNav(s);
      const isOff = detector.current.push(s.offM, f.acc);
      setOff(isOff);
      if (isOff && !wasOff.current) { navigator.vibrate?.([300, 150, 300]); beep(); }
      wasOff.current = isOff;
    }
    if (m && lib) {
      if (!me.current) { const d = document.createElement("div"); d.className = "grid size-9 place-items-center rounded-full border-2 border-white bg-glacier-600 text-white shadow-lg"; d.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2l6 18-6-4-6 4z"/></svg>'; d.setAttribute("aria-label", "Votre position"); me.current = new lib.Marker({ element: d, rotationAlignment: "map" }).setLngLat([f.lng, f.lat]).addTo(m); }
      else me.current.setLngLat([f.lng, f.lat]);
      if (hd != null && !Number.isNaN(hd)) me.current.setRotation(hd);
      if (followRef.current) m.easeTo({ center: [f.lng, f.lat], zoom: Math.max(m.getZoom(), 15), duration: 600 });
    }
  }, [map, ml]);

  async function start() {
    setErr(null);
    if (!("geolocation" in navigator)) { setErr("La géolocalisation n'est pas disponible sur cet appareil."); return; }
    fixesRef.current = []; setFixes([]); lastIdx.current = 0; detector.current.reset(); wasOff.current = false; setOff(false); setNav(null); setRecording(true);
    watch.current = navigator.geolocation.watchPosition(onFix, (e) => { if (e.code === e.TIMEOUT) { setWeak(true); return; } setErr(e.code === e.PERMISSION_DENIED ? "Autorisation de localisation refusée : activez-la dans les réglages du navigateur." : "Position indisponible : vérifiez que le GPS est activé."); if (e.code === e.PERMISSION_DENIED) stopWatch(); }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 30000 });
    setActive(true); setFollow(true);
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    if (wl) { try { lock.current = await wl.request("screen"); setWake("on"); } catch { setWake("off"); } } else setWake("unsupported");
  }
  function stopWatch() { if (watch.current != null) navigator.geolocation.clearWatch(watch.current); watch.current = null; lock.current?.release().catch(() => {}); lock.current = null; setWake("off"); setActive(false); }
  useEffect(() => () => { if (watch.current != null) navigator.geolocation.clearWatch(watch.current); lock.current?.release().catch(() => {}); }, []);
  useEffect(() => { if (!active) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [active]);

  function finish() {
    stopWatch();
    const f = fixesRef.current;
    if (f.length < 2) { setErr("Enregistrement trop court : rien à sauvegarder."); return; }
    const st = recordingStats(f);
    const name = prompt("Nom de l'activité", `${SPORTS[sport].label} du ${new Date(f[0].t).toLocaleDateString("fr-FR")}`) ?? "";
    const res = activitiesRepo.upsert({ id: uid(), name: name.trim() || "Activité", sport, startedAt: f[0].t, durationS: st.durationS, distanceM: st.distM, gainM: st.gainM, coords: f.map((x) => [x.lng, x.lat, x.ele, x.t]), routeId: route?.origin === "mine" ? route.id : undefined });
    if (res.ok) location.assign("/compte#activites"); else setErr(res.error ?? "Enregistrement impossible.");
  }

  const st = useMemo(() => recordingStats(fixes), [fixes]);
  const elapsed = fixes.length > 1 ? Math.max(st.durationS, 0) : 0;
  const rel = nav && heading != null ? angleDiff(heading, nav.targetBearing) : nav ? angleDiff(0, nav.targetBearing) : 0;
  void now;

  return (
    <div className="mx-auto grid max-w-5xl gap-4 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_20rem]">
      <div>
        <h1 className="text-2xl font-extrabold sm:text-3xl">Suivi GPS et navigation</h1>
        <div className="relative mt-3 h-[55vh] min-h-[22rem] overflow-hidden rounded-2xl ring-1 ring-ink-100">
          <div className="absolute inset-0"><div ref={el} className="size-full" role="region" aria-label="Carte de navigation" /></div>
          {off && <div role="alert" className="absolute inset-x-3 top-3 flex items-center gap-2 rounded-xl bg-danger px-3 py-2.5 text-white shadow-lg"><AlertTriangle className="size-5 shrink-0" /><div><p className="font-bold">Vous êtes sorti du parcours</p><p className="text-sm">À {Math.round(nav?.offM ?? 0)} m de la trace.</p></div></div>}
          {nav && !off && active && <div className="absolute inset-x-3 top-3 flex items-center gap-3 rounded-xl bg-ink-900/90 px-3 py-2.5 text-white shadow-lg backdrop-blur"><ArrowUp className="size-8 shrink-0 text-ember-400 transition-transform" style={{ transform: `rotate(${rel}deg)` }} aria-hidden="true" /><div><p className="font-bold">{HINT_LABEL[nav.hint]}</p><p className="text-sm text-ink-200">Reste {fmtKm(nav.remainM)} · écart {Math.round(nav.offM)} m</p></div></div>}
          {!follow && active && <button onClick={() => setFollow(true)} className="absolute bottom-8 right-3 grid size-11 place-items-center rounded-full bg-white shadow-lg" aria-label="Recentrer sur ma position"><LocateFixed className="size-5" /></button>}
        </div>
        {weak && active && !err && <p role="status" className="mt-3 rounded-lg bg-warn/10 px-3 py-2 text-sm text-ink-700">Pas de nouvelle position GPS depuis un moment : le signal est peut-être faible ou vous êtes immobile.</p>}
        {err && <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
        <div className="mt-3 grid grid-cols-4 gap-2 text-center">
          {[["Distance", fmtKm(st.distM)], ["Durée", fmtT(elapsed)], ["D+", fmtM(st.gainM)], ["Vitesse", elapsed > 5 ? `${((st.distM / 1000) / (elapsed / 3600)).toFixed(1).replace(".", ",")} km/h` : "—"]].map(([l, v]) => <div key={l} className="rounded-xl bg-white p-2.5 ring-1 ring-ink-100"><p className="text-[10px] font-medium uppercase tracking-wide text-ink-400">{l}</p><p className="font-display text-lg font-bold">{v}</p></div>)}
        </div>
      </div>

      <aside className="grid content-start gap-4">
        <div className="rounded-2xl bg-white p-4 ring-1 ring-ink-100">
          <label className="grid gap-1 text-sm font-medium">Parcours à suivre<select disabled={active} className="h-10 rounded-lg border border-ink-200 bg-white px-2 text-sm" value={routeId} onChange={(e) => setRouteId(e.target.value)}><option value="">Aucun (activité libre)</option>{routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
          <label className="mt-3 grid gap-1 text-sm font-medium">Discipline<select disabled={active} className="h-10 rounded-lg border border-ink-200 bg-white px-2 text-sm" value={sport} onChange={(e) => setSport(e.target.value as Sport)}>{Object.entries(SPORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
          <div className="mt-4 grid gap-2">
            {!active ? <Button size="lg" onClick={start}><Play className="size-5" />Démarrer</Button> : <>
              <Button size="lg" variant={recording ? "secondary" : "brand"} onClick={() => setRecording(!recording)}>{recording ? <><Pause className="size-5" />Pause enregistrement</> : <><Play className="size-5" />Reprendre</>}</Button>
              <Button size="lg" variant="brand" onClick={finish}><Square className="size-5" />Terminer et enregistrer</Button></>}
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-xs text-ink-500" aria-live="polite"><Smartphone className="mt-0.5 size-3.5 shrink-0" />{wake === "on" ? "Écran maintenu allumé pendant le suivi." : wake === "unsupported" ? "Ce navigateur ne peut pas garder l'écran allumé : désactivez la mise en veille." : "Gardez cette page ouverte et visible pendant la sortie."}</p>
        </div>
        <div className="rounded-2xl bg-ink-50 p-4 text-xs text-ink-600">
          <p className="font-semibold text-ink-800">Ce qui est disponible et ce qui ne l'est pas</p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>Suivi, guidage et alertes de sortie de parcours : actifs <b>tant que la page reste ouverte</b>. Un navigateur ne peut pas suivre le GPS écran éteint ; il faudra pour cela une application mobile dédiée.</li>
            <li>Cartes hors ligne : non disponibles (licence des fonds de carte à valider).</li>
            <li>Les activités sont enregistrées sur cet appareil. La synchronisation entre appareils nécessitera les comptes (étape 2).</li>
          </ul>
          <Link href="/compte#activites" className="mt-3 inline-flex items-center gap-1 font-semibold text-pine-700 underline"><Navigation className="size-3.5" />Mes activités</Link>
        </div>
      </aside>
    </div>
  );
}
