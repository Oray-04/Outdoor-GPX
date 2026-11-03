import { CheckCircle2, Circle } from "lucide-react";
import { ROADMAP } from "@/lib/site";

export const metadata = { title: "Feuille de route" };
export default function Page() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-4xl font-extrabold">Feuille de route</h1>
      <p className="mt-3 text-ink-600">Chaque étape livre une fonctionnalité testable, documentée et connectée au reste de l'application.</p>
      <ol className="mt-10 grid gap-3">
        {ROADMAP.map((s) => (
          <li key={s.step} className="flex items-center gap-4 rounded-xl bg-white p-4 ring-1 ring-ink-100">
            {s.status === "done" ? <CheckCircle2 className="size-6 text-pine-600" /> : <Circle className="size-6 text-ink-300" />}
            <div className="flex-1"><p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Étape {s.step}</p><p className="font-semibold">{s.title}</p></div>
            <span className={`text-sm font-medium ${s.status === "done" ? "text-pine-600" : "text-ink-400"}`}>{s.status === "done" ? "Livrée" : "À venir"}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
