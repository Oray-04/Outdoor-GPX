"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { saveProfile, useProfile, type Activity } from "@/lib/repo";
import { SPORTS } from "@/lib/sports";
import { fmtKm, fmtM } from "@/lib/geo";

export function ProfileForm() {
  const p = useProfile();
  const [saved, setSaved] = useState(false);
  const inp = "h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm";
  const upd = (patch: Partial<typeof p>) => { saveProfile({ ...p, ...patch }); setSaved(true); setTimeout(() => setSaved(false), 1500); };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-sm font-medium">Nom affiché<input className={inp} value={p.name} onChange={(e) => upd({ name: e.target.value })} maxLength={60} /></label>
      <label className="grid gap-1 text-sm font-medium">Objectif mensuel (km)<input type="number" min={0} className={inp} value={p.goalKmMonth} onChange={(e) => upd({ goalKmMonth: Math.max(0, +e.target.value || 0) })} /></label>
      <label className="grid gap-1 text-sm font-medium sm:col-span-2">Présentation<textarea rows={2} className="rounded-lg border border-ink-200 p-2 text-sm" value={p.bio} onChange={(e) => upd({ bio: e.target.value })} maxLength={300} /></label>
      <fieldset className="sm:col-span-2"><legend className="mb-1 text-sm font-medium">Disciplines pratiquées</legend><div className="flex flex-wrap gap-1.5">{Object.entries(SPORTS).map(([k, v]) => { const on = p.sports.includes(k); return <button key={k} type="button" aria-pressed={on} onClick={() => upd({ sports: on ? p.sports.filter((x) => x !== k) : [...p.sports, k] })} className={`rounded-full border px-3 py-1 text-xs font-medium ${on ? "border-pine-600 bg-pine-600 text-white" : "border-ink-200"}`}>{v.label}</button>; })}</div></fieldset>
      <p className="text-xs text-ink-500 sm:col-span-2" aria-live="polite">{saved ? "Enregistré sur cet appareil." : "Profil enregistré automatiquement sur cet appareil. Un profil public nécessitera les comptes (étape 2)."}</p>
    </div>
  );
}

export const monthKey = (t: number) => new Date(t).toISOString().slice(0, 7);

export function activityTotals(acts: Activity[]) {
  return { km: acts.reduce((a, x) => a + x.distanceM, 0), gain: acts.reduce((a, x) => a + x.gainM, 0), s: acts.reduce((a, x) => a + x.durationS, 0), n: acts.length };
}

export function Progress({ label, value, goal, unit }: { label: string; value: number; goal: number; unit: string }) {
  const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;
  return (
    <div><div className="flex justify-between text-sm"><span className="font-medium">{label}</span><span className="text-ink-500">{Math.round(value).toLocaleString("fr-FR")} / {goal.toLocaleString("fr-FR")} {unit}{pct >= 100 && " ✓"}</span></div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink-100" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}><div className="h-full rounded-full bg-pine-500 transition-all" style={{ width: `${pct}%` }} /></div></div>
  );
}

export function MonthlyChart({ acts }: { acts: Activity[] }) {
  const months: string[] = []; const d = new Date(); d.setDate(1);
  for (let i = 5; i >= 0; i--) { const x = new Date(d.getFullYear(), d.getMonth() - i, 1); months.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`); }
  const vals = months.map((m) => acts.filter((a) => monthKey(a.startedAt) === m).reduce((s, a) => s + a.distanceM / 1000, 0));
  const max = Math.max(10, ...vals);
  return (
    <svg viewBox="0 0 300 130" className="w-full" role="img" aria-label="Kilomètres par mois sur 6 mois">
      {vals.map((v, i) => { const h = (v / max) * 90; return (<g key={i}><rect x={i * 50 + 10} y={100 - h} width="30" height={h} rx="4" fill="#2a9170" /><text x={i * 50 + 25} y={96 - h} textAnchor="middle" fontSize="10" fill="#36504a">{v >= 1 ? Math.round(v) : ""}</text><text x={i * 50 + 25} y="118" textAnchor="middle" fontSize="10" fill="#74897f">{new Date(months[i] + "-01T12:00:00").toLocaleDateString("fr-FR", { month: "short" })}</text></g>); })}
      <line x1="0" x2="300" y1="100" y2="100" stroke="#e4ebe7" /></svg>
  );
}

export const fmtAct = (a: Activity) => `${fmtKm(a.distanceM)} · ${fmtM(a.gainM)} D+`;
export { Button };
