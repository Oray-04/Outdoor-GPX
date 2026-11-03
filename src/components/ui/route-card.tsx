import { Mountain, TrendingUp, Clock, Repeat } from "lucide-react";
import type { DemoRoute } from "@/lib/demo-data";
import { fmtKm, fmtM, fmtDuration } from "@/lib/geo";
import { SPORTS, DIFFICULTY_LABEL } from "@/lib/sports";
import { Badge, DemoBadge } from "./badge";
import { ElevationSpark } from "./elevation-spark";

const diffTone = { facile: "pine", modere: "glacier", difficile: "ember", expert: "dark" } as const;

export function RouteCard({ route, note }: { route: DemoRoute; note?: string }) {
  const s = route.stats;
  return (
    <article className="group overflow-hidden rounded-[var(--radius-card)] bg-white shadow-card ring-1 ring-ink-100 transition duration-300 hover:-translate-y-1 hover:shadow-lift">
      <div className="relative h-36 overflow-hidden" style={{ background: `linear-gradient(135deg, hsl(${route.hue} 45% 22%), hsl(${route.hue} 55% 38%))` }}>
        <TopoPattern />
        <div className="absolute inset-x-0 bottom-0 text-white/90"><ElevationSpark values={route.profile} stroke="#fff" className="h-16 w-full" /></div>
        <div className="absolute left-3 top-3 flex gap-1.5"><Badge tone="dark">{SPORTS[route.sport].label}</Badge><DemoBadge /></div>
        {route.loop && <span className="absolute right-3 top-3 grid size-7 place-items-center rounded-full bg-white/15 text-white" title="Parcours en boucle"><Repeat className="size-3.5" /></span>}
      </div>
      <div className="p-4">
        <h3 className="text-lg font-semibold leading-snug text-ink-900">{route.name}</h3>
        <p className="mt-0.5 text-sm text-ink-500">{route.region} · {route.country}{note ? ` · ${note}` : ""}</p>
        <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
          <Stat icon={<TrendingUp className="size-3.5" />} label="Distance" value={fmtKm(s.distanceM)} />
          <Stat icon={<Mountain className="size-3.5" />} label="D+" value={fmtM(s.gainM)} />
          <Stat icon={<Clock className="size-3.5" />} label="Durée" value={fmtDuration(route.durationMin)} />
        </dl>
        <div className="mt-4"><Badge tone={diffTone[route.difficulty]} className={route.difficulty === "expert" ? "!bg-ink-900 !text-white !border-0" : ""}>{DIFFICULTY_LABEL[route.difficulty]}</Badge></div>
      </div>
    </article>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-ink-400">{icon}{label}</dt>
      <dd className="mt-0.5 font-display font-semibold text-ink-900">{value}</dd>
    </div>
  );
}

export function TopoPattern({ className = "" }: { className?: string }) {
  return (
    <svg className={`absolute inset-0 size-full opacity-[0.16] ${className}`} viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true" fill="none" stroke="#fff" strokeWidth="1">
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <ellipse key={i} cx={260} cy={90} rx={30 + i * 26} ry={14 + i * 14} transform={`rotate(-14 260 90)`} />
      ))}
      {[0, 1, 2, 3].map((i) => (
        <ellipse key={`b${i}`} cx={60} cy={170} rx={20 + i * 24} ry={10 + i * 12} transform="rotate(10 60 170)" />
      ))}
    </svg>
  );
}
