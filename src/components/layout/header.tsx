"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { User } from "lucide-react";
import clsx from "clsx";
import { Logo } from "@/components/ui/logo";
import { ButtonLink } from "@/components/ui/button";
import { NAV } from "@/lib/site";
import { useAuth } from "@/lib/auth";

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const path = usePathname();
  const auth = useAuth();

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <header className={clsx("sticky top-0 z-50 border-b transition-colors duration-300", scrolled ? "border-ink-100 bg-paper/90 backdrop-blur-lg" : "border-transparent bg-paper")}>
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
          {auth.enabled && !auth.user && <ButtonLink href="/connexion" variant="ghost" size="sm">Connexion</ButtonLink>}
          <ButtonLink href="/compte" variant="ghost" size="sm"><User className="size-4" />{auth.user ? (auth.user.email ?? "Mon espace").split("@")[0] : "Mon espace"}</ButtonLink>
          <ButtonLink href="/creer" size="sm">Créer un parcours</ButtonLink>
        </div>
        <div className="ml-auto flex items-center gap-1 lg:hidden"><Link href={auth.enabled && !auth.user ? "/connexion" : "/compte"} aria-label={auth.user ? "Mon espace" : auth.enabled ? "Connexion" : "Mon espace"} className="grid size-11 place-items-center rounded-full hover:bg-ink-100"><User className="size-5" /></Link></div>
      </div>
    </header>
  );
}
