import { SITE } from "@/lib/site";

export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--color-pine-600)" />
      <path d="M4 24 L12 11 L16.5 18 L20 13 L28 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="11" r="2.4" fill="var(--color-ember-500)" />
    </svg>
  );
}

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark />
      <span className={`font-display text-xl font-bold tracking-tight ${light ? "text-white" : "text-ink-900"}`}>{SITE.name}</span>
    </span>
  );
}
