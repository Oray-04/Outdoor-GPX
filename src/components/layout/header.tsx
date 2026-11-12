"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown, User } from "lucide-react";
import clsx from "clsx";
import { Logo } from "@/components/ui/logo";
import { ButtonLink } from "@/components/ui/button";
import { NAV } from "@/lib/site";
import { useAuth } from "@/lib/auth";

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const path = usePathname();
  const auth = useAuth();
  const [menu, setMenu] = useState<string | null>(null);
  useEffect(() => setMenu(null), [path]);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  if (path.startsWith("/integrer")) return null; // vue intégrable : aucune navigation du site
  return (
    <header className={clsx("glass-dark sticky top-0 z-50 text-white transition-shadow duration-300", scrolled && "shadow-[0_12px_30px_-18px_rgb(5_11_11/0.9)]")}>
      <div className="hairline absolute inset-x-0 bottom-0 opacity-60" aria-hidden="true" />
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:gap-6">
        <Link href="/" aria-label="Accueil Crête" className="transition-opacity hover:opacity-90"><Logo light /></Link>
        <nav aria-label="Navigation principale" className="hidden flex-1 items-center gap-0.5 md:flex lg:gap-1">
          {NAV.map((g) => {
            const on = g.match.some((m) => path.startsWith(m));
            const cls = clsx("relative flex items-center gap-1 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium transition-colors after:absolute after:inset-x-3.5 after:-bottom-px after:h-px after:origin-left after:bg-brass-400 after:transition-transform after:duration-300", on ? "text-white after:scale-x-100" : "text-white/70 hover:text-white after:scale-x-0 hover:after:scale-x-100");
            if (!g.items) return <Link key={g.id} href={g.href} aria-current={on ? "page" : undefined} className={cls}>{g.label}</Link>;
            const open = menu === g.id;
            return (
              <div key={g.id} className="relative" onMouseEnter={() => setMenu(g.id)} onMouseLeave={() => setMenu((m) => (m === g.id ? null : m))} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setMenu((m) => (m === g.id ? null : m)); }}>
                <button type="button" aria-haspopup="true" aria-expanded={open} onClick={() => setMenu(open ? null : g.id)} onKeyDown={(e) => { if (e.key === "Escape") setMenu(null); }} className={cls}>{g.label}<ChevronDown className={clsx("size-3.5 transition-transform duration-200", open && "rotate-180")} /></button>
                {open && (
                  <div className="absolute left-0 top-full z-50 pt-2">
                    <ul role="menu" aria-label={g.label} className="w-80 rounded-2xl border border-white/10 bg-ink-950/95 p-2 shadow-lift backdrop-blur-xl [animation:page-in_.18s_var(--ease-out-soft)_both]">
                      {g.items.map((it) => (
                        <li key={it.href} role="none"><Link role="menuitem" href={it.href} onClick={() => setMenu(null)} className={clsx("block rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.08]", path === it.href.split("?")[0].replace(/\/$/, "") || path === it.href.split("?")[0] ? "bg-white/[0.06]" : "")}>
                          <span className="block text-sm font-semibold text-white">{it.label}</span>{it.hint && <span className="block text-xs text-white/55">{it.hint}</span>}
                        </Link></li>))}
                    </ul>
                  </div>)}
              </div>);
          })}
        </nav>
        <div className="ml-auto hidden items-center gap-1 md:flex lg:gap-2">
          {auth.enabled && !auth.user && <ButtonLink href="/connexion" variant="onDark" size="sm">Connexion</ButtonLink>}
          <ButtonLink href="/compte" variant="onDark" size="sm" className="!border-transparent !bg-transparent hover:!bg-white/10"><User className="size-4" /><span className="max-lg:sr-only">{auth.user ? (auth.user.email ?? "Mon espace").split("@")[0] : "Mon espace"}</span></ButtonLink>
          <ButtonLink href="/creer" size="sm">Créer un parcours</ButtonLink>
        </div>
        <div className="ml-auto flex items-center gap-1 md:hidden"><Link href={auth.enabled && !auth.user ? "/connexion" : "/compte"} aria-label={auth.user ? "Mon espace" : auth.enabled ? "Connexion" : "Mon espace"} className="grid size-11 place-items-center rounded-full text-white hover:bg-white/10"><User className="size-5" /></Link></div>
      </div>
    </header>
  );
}
