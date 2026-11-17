import type { NutritionResult } from "./engine";
import type { PlanInput } from "./types";
import { CATEGORY_SHORT } from "./products";
import { shortfalls } from "./plan";
import { gapFixes } from "./gaps";
import { DISCLAIMER, ESTABLISHED, ASSUMPTIONS } from "./references";
import { LEVEL_LABEL, TOLERANCE_LABEL, HABIT_LABEL, INTENSITY_LABEL, RACE_LABEL, SWEAT_LABEL, SKY_LABEL, fmtDur, fmtL } from "./labels";

/** La police intégrée du PDF ne couvre que l'alphabet latin courant : symboles convertis en équivalents lisibles. */
export const pdfSafe = (t: string) => t.replace(/≈\s?/g, "env. ").replace(/→/g, ">").replace(/−/g, "-").replace(/≤/g, "<=").replace(/≥/g, ">=").replace(/[‑‒]/g, "-").replace(/\u202f|\u00a0/g, " ");

/** Fiche de course imprimable (A4) : profil, course, besoins, planning, produits, recommandations. */
export async function nutritionPdf(i: PlanInput, r: NutritionResult): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 186, L = 12; let y = 14;
  const room = (h: number) => { if (y + h > 285) { doc.addPage(); y = 14; } };
  const h1 = (t: string) => { y += 2; room(12); doc.setFont("helvetica", "bold"); doc.setFontSize(11.5); doc.setTextColor(18, 98, 75); doc.text(t, L, y); doc.setTextColor(0); y += 5.5; doc.setFont("helvetica", "normal"); doc.setFontSize(9); };
  const line = (t: string, size = 9) => { doc.setFontSize(size); const ls = doc.splitTextToSize(pdfSafe(t), W); room(ls.length * 4.2); doc.text(ls, L, y); y += ls.length * 4.2; };
  // en-tête
  doc.setFillColor(10, 21, 20); doc.rect(0, 0, 210, 26, "F"); doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text("Plan nutritionnel de course", L, 12); doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text(pdfSafe(`${i.race.name || RACE_LABEL[i.race.type]} · ${i.race.distanceKm ?? "?"} km${i.race.gainM ? ` · ${i.race.gainM} m D+` : ""} · ${fmtDur(i.race.durationMin!)} · départ ${i.race.startTime}`), L, 19);
  doc.setTextColor(0); y = 34;
  // indicateurs
  const kpi = [["Glucides", `${r.carbs.gph} g/h`, `${r.carbs.totalG} g au total`], ["Eau", `${r.hydration.mlh} ml/h`, `${fmtL(r.hydration.totalMl)} au total`], ["Sodium", `${r.sodium.mgh} mg/h`, `${r.sodium.totalMg} mg au total`], ["Caféine", `${r.caffeine.totalMg} mg`, `${r.caffeine.totalMgKg} mg/kg cumulés`]];
  kpi.forEach(([a, b, c], k) => { const x = L + k * 47; doc.setDrawColor(210); doc.roundedRect(x, y - 5, 44, 19, 2, 2); doc.setFontSize(8); doc.setTextColor(100); doc.text(a, x + 3, y); doc.setTextColor(0); doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text(b, x + 3, y + 6.5); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.text(c, x + 3, y + 11.5); });
  y += 21;
  h1("Profil et conditions");
  line(`${i.athlete.weightKg} kg · niveau ${LEVEL_LABEL[i.athlete.level].toLowerCase()}${i.athlete.experienceYears != null ? ` · ${i.athlete.experienceYears} an(s) d'endurance` : ""} · tolérance digestive ${TOLERANCE_LABEL[i.athlete.tolerance].toLowerCase()} · ${HABIT_LABEL[i.athlete.habit].toLowerCase()}.`);
  line(`${RACE_LABEL[i.race.type]} · intensité ${INTENSITY_LABEL[i.race.intensity].toLowerCase()} · ${i.weather.tempC} °C, ${i.weather.humidityPct} % d'humidité, ${SKY_LABEL[i.weather.sky].toLowerCase()} · sudation ${SWEAT_LABEL[i.weather.sweat].toLowerCase()}.`);
  h1("Rythme pendant la course");
  { const iv = r.interval, every = (m: number) => { if (m < 60 && Math.abs(m - Math.round(m)) > 0.05) return `${Math.floor(m)} à ${Math.ceil(m)} min`; const x = Math.round(m); return x >= 60 ? `${Math.floor(x / 60)} h ${String(x % 60).padStart(2, "0")}` : `${x} min`; };
    line(iv.basis === "produits" ? `Manger : ${iv.portions > 1 ? `${iv.portions} portions` : "1 portion"} toutes les ${every(iv.carbEveryMin)} (${iv.servingG} g de glucides par portion, environ ${iv.effectiveGph} g/h ; objectif ${r.carbs.gph} g/h).` : iv.basis === "boisson" ? `Manger : la boisson apporte les ${r.carbs.gph} g/h prévus.` : iv.basis === "aucun-objectif" ? "Manger : aucun apport nécessaire pour cette durée." : `Manger : ${r.carbs.gph} g de glucides par heure (aucun produit choisi).`);
    line(`Boire : environ ${Math.round((r.hydration.mlh * iv.stepMin) / 60 / 10) * 10} ml toutes les ${every(iv.stepMin)} (${r.hydration.mlh} ml/h), par petites gorgées.`); }
  h1("Besoins estimés");
  line(`Glucides : ${r.carbs.gph} g/h (${r.carbs.band.label.toLowerCase()} ; plafond personnel ${r.carbs.cap} g/h)${r.carbs.ramp[0] < 1 ? `, montée progressive ${r.carbs.ramp.map((f) => Math.round(r.carbs.gph * f)).join(" → ")} g/h` : ""}. Total ${r.carbs.totalG} g.`);
  line(`Sueur : ${r.hydration.sweatLh} L/h (${r.hydration.reliability === "mesuree" ? "mesuré" : `estimé, fourchette ${r.hydration.sweatRange[0]}–${r.hydration.sweatRange[1]} L/h`}). Boire ${r.hydration.mlh} ml/h (${r.hydration.replacePct} % des pertes), soit ${fmtL(r.hydration.totalMl)}. Perte de masse prévue ≈ ${r.hydration.lossPct} %.`);
  line(`Sodium : pertes ≈ ${r.sodium.lossMgH} mg/h (sueur à ${r.sodium.sweatMgL} mg/L, ${r.sodium.reliability === "mesuree" ? "mesurée" : "estimée"}) ; apport visé ${r.sodium.mgh} mg/h, soit ${r.sodium.totalMg} mg.`);
  line(r.caffeine.totalMg ? `Caféine : ${r.caffeine.doses.map((d) => `${d.mg} mg à ${d.atMin < 0 ? `${-d.atMin} min avant le départ` : `${fmtDur(d.atMin)} de course`}`).join(", ")} (total ${r.caffeine.totalMg} mg, ${r.caffeine.totalMgKg} mg/kg).` : "Caféine : aucune.");
  // objectifs non atteints
  const sf = shortfalls(r.plan), fixes = gapFixes(i, sf.totals);
  if (fixes.length) {
    y += 2; room(10 + fixes.length * 10); doc.setFillColor(253, 226, 222); doc.setDrawColor(192, 54, 44);
    const top = y - 4; let yy = y + 2; doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(192, 54, 44); doc.text("OBJECTIFS NON ATTEINTS", L + 3, yy); yy += 5;
    doc.setFontSize(9); const blocks = fixes.map((f) => [pdfSafe(`${f.title} : ${f.got} ${f.unit} prévus pour ${f.target} ${f.unit} — MANQUE ${f.gap} ${f.unit}`), ...doc.splitTextToSize(pdfSafe(f.how), W - 6)]);
    const h = blocks.reduce((a, b) => a + b.length * 4.2 + 1, 0) + 9; doc.rect(L, top, W, h, "FD");
    for (const b of blocks) { doc.setFont("helvetica", "bold"); doc.setTextColor(192, 54, 44); doc.text(b[0], L + 3, yy); yy += 4.2; doc.setFont("helvetica", "normal"); doc.setTextColor(40); doc.text(b.slice(1), L + 3, yy); yy += (b.length - 1) * 4.2 + 1; }
    doc.setTextColor(0); y = top + h + 4;
  }
  // planning
  h1("Planning chronologique");
  const cols = [L, L + 22, L + 36, L + 51, L + 65, L + 83, L + 99];
  const head = () => { doc.setFont("helvetica", "bold"); doc.setFontSize(8); ["Heure", "Km", "Gluc. (g)", "Eau (ml)", "Na (mg)", "Caféine", "Produits"].forEach((t, k) => doc.text(t, cols[k], y)); doc.setFont("helvetica", "normal"); y += 1.5; doc.setDrawColor(200); doc.line(L, y, L + W, y); y += 4; };
  head();
  const run = r.plan.slots.filter((x) => x.kind === "course");
  for (const s of r.plan.slots) {
    const prod = [...s.items.map((it) => `${it.qty} × ${it.name}`), ...(s.drinkMl ? [`${Math.round(s.drinkMl)} ml de boisson`] : []), ...(s.plainWaterMl ? [`${Math.round(s.plainWaterMl)} ml d'eau`] : []), ...(s.caffeineOtherMg ? [`${s.caffeineOtherMg} mg de caféine (café, comprimé…)`] : [])].join(", ") + (s.aid ? ` — ${s.aid}` : "");
    const ls = doc.splitTextToSize(pdfSafe(prod || "-"), W - 99);
    if (y + ls.length * 3.6 > 285) { doc.addPage(); y = 14; head(); }
    doc.setFontSize(8); doc.text(s.clock, cols[0], y); doc.text(s.km != null ? String(s.km) : "-", cols[1], y);
    const k = run.indexOf(s), fl = k >= 0 ? sf.slots[k] : null;
    ([["carbsG", 2], ["waterMl", 3], ["sodiumMg", 4]] as const).forEach(([m, c]) => { const bad = fl?.[m].behind; if (bad) { doc.setTextColor(192, 54, 44); doc.setFont("helvetica", "bold"); } doc.text(`${Math.round(s.got[m])}${bad ? ` (-${fl![m].behindBy})` : ""}`, cols[c], y); doc.setTextColor(0); doc.setFont("helvetica", "normal"); }); doc.text(s.target.caffeineMg ? `${s.target.caffeineMg} mg` : "", cols[5], y); doc.text(ls, cols[6], y);
    y += Math.max(4.2, ls.length * 3.6);
  }
  // tronçons et produits
  h1("À emporter par tronçon");
  for (const g of r.plan.segments) line(`${g.from.name} → ${g.to.name}${g.to.km != null && g.from.km != null ? ` (${(g.to.km - g.from.km).toFixed(1)} km)` : ""} : ${g.items.map((it) => `${it.qty} × ${it.name}`).join(", ") || "aucun produit"}${g.drinkPortions ? `, ${g.drinkPortions} portion(s) de boisson` : ""} · ${g.carryWaterMl} ml de liquide · ${Math.round(g.got.carbsG)} g de glucides, ${Math.round(g.got.sodiumMg)} mg de sodium.`);
  h1("Total des produits");
  if (r.plan.totals.items.length || r.plan.totals.drinkPortions) { r.plan.totals.items.forEach((it) => { const p = i.products.find((x) => x.id === it.productId); line(`${it.qty} × ${it.name}${p ? ` (${CATEGORY_SHORT[p.category].toLowerCase()})` : ""} — ${Math.round(it.carbsG)} g de glucides, ${Math.round(it.sodiumMg)} mg de sodium${it.caffeineMg ? `, ${Math.round(it.caffeineMg)} mg de caféine` : ""}`); }); if (r.plan.totals.drinkPortions) line(`${r.plan.totals.drinkPortions} portion(s) de boisson.`); }
  else line("Aucun produit du catalogue sélectionné : quantités en grammes, millilitres et milligrammes ci-dessus.");
  h1("Recommandations importantes");
  for (const n of [...r.warnings, ...r.carbs.notices, ...r.hydration.notices, ...r.sodium.notices, ...r.caffeine.notices, ...r.plan.notices].filter((n) => n.level !== "info")) line(`• ${n.text}`);
  for (const p of r.caffeine.totalMg ? r.caffeine.precautions : []) line(`• ${p}`);
  line(`• ${DISCLAIMER}`);
  h1("Bases scientifiques et hypothèses");
  line("Établi : " + ESTABLISHED.join(" "), 7.5); line("Hypothèses de calcul : " + ASSUMPTIONS.join(" "), 7.5);
  const pages = doc.getNumberOfPages();
  for (let k = 1; k <= pages; k++) { doc.setPage(k); doc.setFontSize(7); doc.setTextColor(130); doc.text(`Crête — planificateur nutritionnel · estimations, pas un avis médical · page ${k}/${pages}`, L, 292); doc.setTextColor(0); }
  return doc.output("blob");
}
