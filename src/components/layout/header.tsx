"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X, User } from "lucide-react";
import clsx from "clsx";
import { Logo } from "@/components/ui/logo";
import { ButtonLink } from "@/components/ui/button";
import { NAV } from "@/lib/site";

export function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const path = usePathname();

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <header className={clsx("sticky top-0 z-50 border-b transition-colors duration-300", scrolled || open ? "border-ink-100 bg-paper/90 backdrop-blur-lg" : "border-transparent bg-paper")}>
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" aria-label="Accueil Crête"><Logo /></Link>
        <nav aria-label="Navigation principale" className="hidden flex-1 items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={path.startsWith(n.href) ? "page" : undefined}
              className={clsx("rounded-lg px-3 py-2 text-sm font-medium transition-colors", path.startsWith(n.href) ? "bg-pine-50 text-pine-700" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900")}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-2 lg:flex">
          <ButtonLink href="/compte" variant="ghost" size="sm"><User className="size-4" />Mon espace</ButtonLink>
          <ButtonLink href="/creer" size="sm">Créer un parcours</ButtonLink>
        </div>
        <button className="ml-auto grid size-10 place-items-center rounded-lg hover:bg-ink-100 lg:hidden" aria-label={open ? "Fermer le menu" : "Ouvrir le menu"} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>
      {open && (
        <nav aria-label="Navigation mobile" className="rise border-t border-ink-100 bg-paper px-4 pb-5 pt-2 lg:hidden">
          <ul className="grid gap-1">
            {NAV.map((n) => (
              <li key={n.href}><Link href={n.href} className="block rounded-lg px-3 py-3 text-base font-medium text-ink-800 hover:bg-ink-100">{n.label}</Link></li>
            ))}
          </ul>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <ButtonLink href="/compte" variant="secondary">Mon espace</ButtonLink>
            <ButtonLink href="/creer">Créer</ButtonLink>
          </div>
        </nav>
      )}
    </header>
  );
}
