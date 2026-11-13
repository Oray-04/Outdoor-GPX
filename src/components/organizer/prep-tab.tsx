"use client";
import { useMemo, useState } from "react";
import { TriangleAlert, CircleCheck, Info, FileDown, Copy, FilePlus2, Loader2, Ruler, Siren } from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { routesRepo } from "@/lib/repo";
import { surfaceShare } from "@/lib/routing";
import { profileForSport } from "@/lib/routing";
import { download, safeName } from "@/lib/formats";
import { prepPdf } from "@/lib/pdf";
import type { EventModel } from "@/lib/events";
import type { LL } from "@/lib/types";
import { BUDGET_LINES, EMERGENCY_NUMBERS, EMERGENCY_PROCEDURE, PREP_NOTICE, SITE_SIGNS, adminFile, ageCategories, budgetTotal, classify, departmentsAlong, logisticsChecks, mandatoryGear, medicalPlan, prepReport, raceDay, rulesDraft, timeline, type Prep } from "@/lib/race-prep";

const inp = "h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm";
const card = "rounded-2xl bg-white p-4 ring-1 ring-ink-100 sm:p-5";
const frDate = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long", year: "numeric" }) : "—");
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const LEVEL = { ok: { I: CircleCheck, c: "text-pine-700" }, warn: { I: TriangleAlert, c: "text-warn" }, info: { I: Info, c: "text-glacier-600" } } as const;

export function PrepTab({ ev, save }: { ev: EventModel; save: (fn: (e: EventModel) => EventModel) => void }) {
  const routes = routesRepo.useAll();
  const prep: Prep = ev.prep ?? {};
  const set = (p: Partial<Prep>) => save((e) => ({ ...e, prep: { ...(e.prep ?? {}), ...p } }));
  const done = new Set(prep.done ?? []);
  const toggle = (id: string) => set({ done: done.has(id) ? [...done].filter((x) => x !== id) : [...done, id] });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "warn"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const year = /^\d{4}/.test(ev.date) ? +ev.date.slice(0, 4) : new Date().getFullYear();
  const maxKm = Math.max(0, ...ev.races.map((r) => r.distanceKm));
  const tasks = useMemo(() => timeline(ev.date, !!prep.multiDept), [ev.date, prep.multiDept]);
  const file = adminFile(ev, prep);
  const draft = useMemo(() => rulesDraft(ev, prep), [ev, prep]); // eslint-disable-line react-hooks/exhaustive-deps
  const med = prep.participants ? medicalPlan(prep.participants, maxKm) : null;
  const today = todayISO();
  const linked = ev.races.filter((r) => r.routeId && routes.some((x) => x.id === r.routeId));

  /** Part de goudron de chaque parcours lié et départements traversés : mesurés sur les tracés, jamais supposés. */
  async function measure() {
    setBusy(true); setMsg(null);
    const paved: Record<string, number> = { ...(prep.paved ?? {}) }, deps = new Set<string>(); let okPaved = 0, okDep = true;
    for (const r of linked) {
      const line = routes.find((x) => x.id === r.routeId)!.coords.map((c) => [c[0], c[1]] as LL);
      try { const s = await surfaceShare(line, profileForSport(r.sport)); if (s) { paved[r.id] = Math.round(s.pavedPct); okPaved++; } } catch { /* service indisponible : valeur non renseignée */ }
      const d = await departmentsAlong(line); if (d) d.forEach((x) => deps.add(x)); else okDep = false;
    }
    const departments = okDep ? [...deps].sort() : prep.departments;
    set({ paved, departments, ...(okDep && deps.size ? { multiDept: deps.size > 1 } : {}) });
    setMsg(okPaved === linked.length && okDep ? { kind: "ok", text: `Mesure terminée : part de goudron de ${okPaved} parcours${deps.size ? ` ; département(s) traversé(s) : ${[...deps].sort().join(", ")}` : ""}.` } : { kind: "warn", text: `Mesure incomplète (${okPaved}/${linked.length} parcours pour le goudron${okDep ? "" : ", départements non obtenus"}) : un service de calcul n'a pas répondu. Réessayez dans un instant.` });
    setBusy(false);
  }
  const insertRules = () => { if (ev.rules.trim() && !window.confirm("Un règlement est déjà saisi dans l'onglet Infos. Le remplacer par ce projet ?")) return; save((e) => ({ ...e, rules: draft })); setMsg({ kind: "ok", text: "Projet de règlement copié dans l'onglet Infos : relisez-le et complétez les mentions entre crochets." }); };
  const copyRules = async () => { try { await navigator.clipboard.writeText(draft); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setMsg({ kind: "warn", text: "Copie impossible : sélectionnez le texte à la main." }); } };
  const pdf = async () => download(`${safeName(ev.name)}-preparation.pdf`, await prepPdf(ev.name, `${ev.organizer || "Organisateur à préciser"} · ${ev.date || "date à préciser"} · ${ev.place || "lieu à préciser"}`, PREP_NOTICE, prepReport(ev, prep)), "application/pdf");

  return (
    <div className="grid gap-5">
      <p className="flex gap-2 rounded-xl bg-warn/10 px-3 py-2.5 text-sm text-ink-700"><TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />{PREP_NOTICE}</p>

      <section className={card} aria-labelledby="prep-params">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="prep-params" className="text-lg font-bold">Votre épreuve</h2><p className="text-sm text-ink-500">Ces quatre informations suffisent : le reste est calculé à partir des courses, des postes et des bénévoles déjà saisis.</p></div>
          <Button variant="secondary" onClick={pdf}><FileDown className="size-4" />Dossier de préparation (PDF)</Button></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-sm font-medium">Participants attendus<input type="number" min={0} className={inp} value={prep.participants ?? ""} onChange={(e) => set({ participants: e.target.value === "" ? undefined : Math.max(0, +e.target.value) })} placeholder="ex. 300" /></label>
          <label className="grid gap-1 text-sm font-medium">Spectateurs attendus<input type="number" min={0} className={inp} value={prep.spectators ?? ""} onChange={(e) => set({ spectators: e.target.value === "" ? undefined : Math.max(0, +e.target.value) })} placeholder="ex. 200" /></label>
          <label className="flex items-center gap-2 self-end rounded-lg border border-ink-200 px-3 py-2.5 text-sm"><input type="checkbox" className="size-4 accent-[var(--color-pine-600)]" checked={!!prep.night} onChange={(e) => set({ night: e.target.checked })} />Une partie se court de nuit</label>
          <label className="flex items-center gap-2 self-end rounded-lg border border-ink-200 px-3 py-2.5 text-sm"><input type="checkbox" className="size-4 accent-[var(--color-pine-600)]" checked={!!prep.multiDept} onChange={(e) => set({ multiDept: e.target.checked })} />Traverse plusieurs départements</label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="sm" disabled={busy || !linked.length} onClick={measure}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Ruler className="size-4" />}Mesurer goudron et départements sur les parcours</Button>
          <p className="text-xs text-ink-500">{linked.length ? `${linked.length} parcours lié(s).` : "Liez un parcours à une course (onglet Courses) pour mesurer."}{prep.departments?.length ? ` Départements : ${prep.departments.join(", ")}.` : ""}</p>
        </div>
        {msg && <p role="status" className={clsx("mt-3 rounded-lg px-3 py-2 text-sm", msg.kind === "ok" ? "bg-pine-50 text-pine-700" : "bg-warn/10 text-ink-700")}>{msg.text}</p>}
      </section>

      {!ev.races.length && <p className="rounded-xl border border-dashed border-ink-200 p-6 text-sm text-ink-500">Ajoutez une course dans l&apos;onglet Courses : sa nature, les catégories admises, le matériel et les horaires seront calculés ici.</p>}
      {ev.races.map((r) => {
        const pv = prep.paved?.[r.id], c = classify(r.distanceKm, pv), cats = ageCategories(r.distanceKm, year), day = raceDay(r), checks = logisticsChecks(ev, r, c);
        return (
          <section key={r.id} className={card} aria-label={`Course ${r.label}`}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><h2 className="text-lg font-bold">{r.label}</h2><p className="text-sm text-ink-500">{String(r.distanceKm).replace(".", ",")} km · {Math.round(r.gainM)} m D+ · départ {r.startTime || "à préciser"}</p></div>
            <div className="mt-3 grid gap-4 lg:grid-cols-2">
              <div>
                <h3 className="eyebrow mb-1.5">Nature de l&apos;épreuve</h3>
                <p className="text-sm"><b className="text-base">{c.label}</b> <span className="text-ink-500">({c.range})</span></p>
                <p className={clsx("mt-1 text-sm", c.pavedOk === false ? "font-semibold text-danger" : "text-ink-700")}>Goudron : {c.maxPavedPct} % du parcours au plus{pv != null ? ` — mesuré : ${pv} % (${c.pavedOk ? "conforme" : "au-dessus du plafond"})` : " — non mesuré"}.</p>
                <ul className="mt-1 list-disc pl-5 text-sm text-ink-700">{c.notes.map((n) => <li key={n}>{n}</li>)}</ul>
                <h3 className="eyebrow mb-1.5 mt-4">Catégories admises ({year})</h3>
                <div className="flex flex-wrap gap-1.5">{cats.map((a) => <span key={a.code} title={`${a.ages} — nés en ${a.born}${a.maxKm ? ` — ${a.maxKm} km au plus` : ""}`} className={clsx("rounded-md px-2 py-1 text-xs font-medium", a.allowed ? "bg-pine-50 text-pine-700" : "bg-ink-50 text-ink-400 line-through")}>{a.label}</span>)}</div>
                <p className="mt-1.5 text-xs text-ink-500">Ouverte à partir de la catégorie {cats.find((a) => a.allowed)!.label.toLowerCase()} (nés en {cats.find((a) => a.allowed)!.born}). Distances maximales à réduire si le dénivelé est important.</p>
                <h3 className="eyebrow mb-1.5 mt-4">Matériel à exiger</h3>
                <ul className="list-disc pl-5 text-sm text-ink-700">{mandatoryGear(r.distanceKm, !!prep.night).map((g) => <li key={g}>{g}</li>)}</ul>
              </div>
              <div>
                <h3 className="eyebrow mb-1.5">Horaires du jour J</h3>
                <ol className="grid gap-1 text-sm">{day.steps.map((s) => <li key={s.label} className="flex gap-3"><span className="w-16 shrink-0 font-display font-bold">{s.clock}</span><span>{s.label}{s.estimate && <span className="text-ink-500"> (estimation)</span>}</span></li>)}</ol>
                <p className="mt-1.5 text-xs text-ink-500">Arrivées estimées à partir de la distance et du dénivelé : à ajuster selon le niveau du plateau. La veille : accueil et retrait des dossards de 16 h à 20 h.</p>
                <h3 className="eyebrow mb-1.5 mt-4">Contrôle de la logistique saisie</h3>
                <ul className="grid gap-1.5 text-sm">{checks.map((k) => { const { I, c: col } = LEVEL[k.level]; return <li key={k.text} className="flex gap-2"><I className={clsx("mt-0.5 size-4 shrink-0", col)} aria-label={k.level === "warn" ? "À traiter" : k.level === "ok" ? "Conforme" : "Note"} /><span>{k.text}</span></li>; })}</ul>
              </div>
            </div>
          </section>);
      })}

      <section className={card} aria-labelledby="prep-med">
        <h2 id="prep-med" className="text-lg font-bold">Dispositif médical</h2>
        {med ? (<div className="mt-2 grid gap-4 lg:grid-cols-2">
          <div><p className="text-sm font-semibold">{med.level}{maxKm > 42.195 ? " · course de plus d'un marathon" : ""}</p><ul className="mt-1 list-disc pl-5 text-sm text-ink-700">{med.items.map((i) => <li key={i}>{i}</li>)}</ul></div>
          <div><h3 className="eyebrow mb-1.5">Composition conseillée de l&apos;équipe</h3><ul className="list-disc pl-5 text-sm text-ink-700">{med.team.map((i) => <li key={i}>{i}</li>)}</ul></div>
        </div>) : <p className="mt-1 text-sm text-ink-500">Indiquez le nombre de participants attendus pour obtenir le dispositif recommandé.</p>}
      </section>

      <section className={card} aria-labelledby="prep-time">
        <h2 id="prep-time" className="text-lg font-bold">Échéancier</h2>
        {!/^\d{4}-\d{2}-\d{2}$/.test(ev.date) && <p className="mt-1 text-sm text-ink-500">Saisissez la date de l&apos;épreuve (onglet Infos) pour dater chaque étape.</p>}
        <ul className="mt-3 grid gap-2">{tasks.map((t) => { const id = `t:${t.id}`, ok = done.has(id), late = !ok && !!t.due && t.due < today; return (
          <li key={t.id} className={clsx("flex gap-3 rounded-xl border p-3 text-sm", ok ? "border-ink-100 bg-ink-50 text-ink-500" : late ? "border-warn/50 bg-warn/10" : "border-ink-100")}>
            <input type="checkbox" id={`chk-${t.id}`} className="mt-0.5 size-4 shrink-0 accent-[var(--color-pine-600)]" checked={ok} onChange={() => toggle(id)} />
            <label htmlFor={`chk-${t.id}`} className="min-w-0 flex-1 cursor-pointer"><span className="block text-xs font-semibold text-ink-500">{t.due ? frDate(t.due) : t.when}{t.due && ` · ${t.when}`}{t.indicative && " · date indicative"}{late && <b className="text-warn"> · échéance dépassée</b>}</span><span className={clsx("font-medium", ok && "line-through")}>{t.label}</span>{t.detail && <span className="block text-xs text-ink-500">{t.detail}</span>}</label>
          </li>); })}</ul>
      </section>

      <section className={card} aria-labelledby="prep-file">
        <h2 id="prep-file" className="text-lg font-bold">Dossier administratif</h2>
        <p className="text-sm text-ink-500">{file.filter((f) => f.ok).length} pièce(s) sur {file.length} prêtes. Les lignes « auto » se mettent à jour d&apos;après vos saisies ; cochez les autres vous-même.</p>
        <ul className="mt-3 grid gap-1.5 md:grid-cols-2">{file.map((f) => (
          <li key={f.id} className="flex gap-2.5 rounded-lg border border-ink-100 p-2.5 text-sm">
            {f.auto ? (f.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-pine-700" aria-label="Prêt" /> : <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-label="À compléter" />) : <input type="checkbox" id={`f-${f.id}`} className="mt-0.5 size-4 shrink-0 accent-[var(--color-pine-600)]" checked={f.ok} onChange={() => toggle(f.id)} />}
            <label htmlFor={f.auto ? undefined : `f-${f.id}`} className="min-w-0"><span className="font-medium">{f.label}</span>{f.auto && <span className="ml-1.5 rounded bg-ink-50 px-1 text-[10px] font-semibold uppercase text-ink-500">auto</span>}{f.detail && <span className="block text-xs text-ink-500">{f.detail}</span>}</label>
          </li>))}</ul>
      </section>

      <section className={card} aria-labelledby="prep-budget">
        <h2 id="prep-budget" className="text-lg font-bold">Budget prévisionnel</h2>
        <p className="text-sm text-ink-500">Postes à la charge de l&apos;organisateur. Montants en euros, enregistrés sur cet appareil.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{BUDGET_LINES.map((l) => <label key={l.id} className="grid gap-1 text-sm">{l.label}<input type="number" min={0} step="10" className={inp} value={prep.budget?.[l.id] || ""} onChange={(e) => set({ budget: { ...(prep.budget ?? {}), [l.id]: Math.max(0, +e.target.value || 0) } })} placeholder="0" /></label>)}</div>
        <p className="mt-3 text-sm font-semibold">Total des dépenses : <span className="font-display text-lg">{budgetTotal(prep.budget).toLocaleString("fr-FR")} €</span>{prep.participants ? <span className="font-normal text-ink-500"> · soit {(budgetTotal(prep.budget) / prep.participants).toFixed(2).replace(".", ",")} € par participant attendu</span> : null}</p>
      </section>

      <section className={card} aria-labelledby="prep-rules">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="prep-rules" className="text-lg font-bold">Règlement type</h2><p className="text-sm text-ink-500">Projet rédigé à partir de vos courses, barrières horaires et matériel. À relire : les mentions entre crochets restent à compléter.</p></div>
          <div className="flex flex-wrap gap-2"><Button variant="secondary" size="sm" onClick={copyRules}><Copy className="size-4" />{copied ? "Copié" : "Copier"}</Button><Button size="sm" onClick={insertRules}><FilePlus2 className="size-4" />Utiliser comme règlement</Button></div></div>
        <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-ink-50 p-3 font-sans text-xs leading-relaxed text-ink-800" tabIndex={0} aria-label="Projet de règlement">{draft}</pre>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={card} aria-labelledby="prep-urg">
          <h2 id="prep-urg" className="flex items-center gap-2 text-lg font-bold"><Siren className="size-5 text-danger" />Affichage d&apos;urgence</h2>
          <p className="text-sm text-ink-500">À afficher au départ, à l&apos;arrivée et à l&apos;accueil, avec le numéro du médecin de garde.</p>
          <div className="mt-3 flex flex-wrap gap-2">{EMERGENCY_NUMBERS.map(([n, l]) => <span key={n} className="rounded-xl bg-danger/10 px-3 py-1.5 text-sm"><b className="font-display text-lg text-danger">{n}</b> {l}</span>)}</div>
          <ol className="mt-3 list-decimal pl-5 text-sm text-ink-700">{EMERGENCY_PROCEDURE.map((s) => <li key={s}>{s}</li>)}</ol>
        </section>
        <section className={card} aria-labelledby="prep-sign">
          <h2 id="prep-sign" className="text-lg font-bold">Signalétique du site</h2>
          <p className="text-sm text-ink-500">Panneaux à prévoir pour circuler sans hésiter ; cochez ceux qui sont prêts.</p>
          <ul className="mt-3 grid gap-1.5 text-sm">{SITE_SIGNS.map((s, i) => <li key={s}><label className="flex cursor-pointer items-start gap-2"><input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[var(--color-pine-600)]" checked={done.has(`s:${i}`)} onChange={() => toggle(`s:${i}`)} /><span className={clsx(done.has(`s:${i}`) && "text-ink-500 line-through")}>{s}</span></label></li>)}</ul>
        </section>
      </div>
    </div>
  );
}
