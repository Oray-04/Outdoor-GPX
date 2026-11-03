import type { ReactNode } from "react";
import { ButtonLink } from "./button";
import { ArrowRight } from "lucide-react";

export function Section({ id, eyebrow, title, action, children, tone = "light" }: {
  id?: string; eyebrow?: string; title: string; action?: { href: string; label: string }; children: ReactNode; tone?: "light" | "white";
}) {
  return (
    <section id={id} className={tone === "white" ? "bg-white" : ""}>
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            {eyebrow && <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-pine-600">{eyebrow}</p>}
            <h2 className="text-3xl font-bold text-ink-900 sm:text-4xl">{title}</h2>
          </div>
          {action && <ButtonLink href={action.href} variant="secondary" size="sm">{action.label}<ArrowRight className="size-4" /></ButtonLink>}
        </div>
        {children}
      </div>
    </section>
  );
}
