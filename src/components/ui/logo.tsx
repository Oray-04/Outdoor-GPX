import { SITE } from "@/lib/site";

export function LogoMark({ className = "size-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 36" className={className} aria-hidden="true">
      <defs><linearGradient id="lg-crete" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--color-pine-500)" /><stop offset="1" stopColor="var(--color-ink-900)" /></linearGradient></defs>
      <rect x="1" y="1" width="34" height="34" rx="10" fill="url(#lg-crete)" stroke="var(--color-brass-400)" strokeWidth="1" />
      {/* courbes de niveau + ligne de crête */}
      <path d="M5 27.5c5-2 8 1 13 0s8-2.5 13-.5" fill="none" stroke="#fff" strokeOpacity=".28" strokeWidth="1" strokeLinecap="round" />
      <path d="M5 23.5 13 11l5 7.5 4-5L31 23.5" fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="13" cy="11" r="2.3" fill="#f0612b" stroke="var(--color-ink-900)" strokeWidth=".8" />
    </svg>
  );
}

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark />
      <span className={`font-[family-name:var(--font-serif)] text-[1.45rem] font-semibold leading-none tracking-tight ${light ? "text-white" : "text-ink-900"}`}>{SITE.name}</span>
    </span>
  );
}
