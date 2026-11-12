import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/** État vide commun : dit ce qui manque et propose la suite, au lieu d'une simple phrase grise. */
export function EmptyState({ icon: Icon, title, children, actions }: { icon: LucideIcon; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-ink-200 bg-white/60 px-6 py-10 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-pine-50 text-pine-700"><Icon className="size-6" aria-hidden="true" /></span>
      <p className="mt-3 font-display text-lg font-bold text-ink-900">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-md text-sm text-ink-600">{children}</p>}
      {actions && <div className="mt-4 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}
