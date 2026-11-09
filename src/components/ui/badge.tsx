import clsx from "clsx";
import type { ReactNode } from "react";

const tones = {
  neutral: "bg-ink-100 text-ink-700",
  pine: "bg-pine-100 text-pine-700",
  ember: "bg-ember-100 text-ember-600",
  glacier: "bg-glacier-100 text-glacier-600",
  dark: "bg-white/[0.07] text-brass-400 border border-brass-400/40 tracking-wide",
} as const;

export function Badge({ tone = "neutral", children, className }: { tone?: keyof typeof tones; children: ReactNode; className?: string }) {
  return <span className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone], className)}>{children}</span>;
}

/** Marqueur obligatoire sur tout contenu issu de données de démonstration. */
export function DemoBadge({ className }: { className?: string }) {
  return (
    <span title="Donnée de démonstration synthétique : ne correspond à aucun parcours ou événement réel" className={clsx("inline-flex items-center rounded-full border border-dashed border-warn/60 bg-warn/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warn", className)}>
      Démo
    </span>
  );
}
