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
            {eyebrow && <p className="eyebrow mb-3 flex items-center gap-3"><span className="h-px w-8 bg-brass-500" aria-hidden="true" />{eyebrow}</p>}
            <h2 className="text-3xl text-ink-900 sm:text-[2.6rem] sm:leading-[1.08]">{title}</h2>
          </div>
          {action && <ButtonLink href={action.href} variant="secondary" size="sm">{action.label}<ArrowRight className="size-4" /></ButtonLink>}
        </div>
        {children}
      </div>
    </section>
  );
}
