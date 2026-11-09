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
    <header className={clsx("glass-dark sticky top-0 z-50 text-white transition-shadow duration-300", scrolled && "shadow-[0_12px_30px_-18px_rgb(5_11_11/0.9)]")}>
      <div className="hairline absolute inset-x-0 bottom-0 opacity-60" aria-hidden="true" />
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" aria-label="Accueil Crête" className="transition-opacity hover:opacity-90"><Logo light /></Link>
        <nav aria-label="Navigation principale" className="hidden flex-1 items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={path.startsWith(n.href) ? "page" : undefined}
              className={clsx("relative whitespace-nowrap rounded-full px-3 py-2 text-[13.5px] font-medium transition-colors after:absolute after:inset-x-3 after:-bottom-px after:h-px after:origin-left after:bg-brass-400 after:transition-transform after:duration-300", path.startsWith(n.href) ? "text-white after:scale-x-100" : "text-white/65 hover:text-white after:scale-x-0 hover:after:scale-x-100")}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-2 lg:flex">
          {auth.enabled && !auth.user && <ButtonLink href="/connexion" variant="onDark" size="sm">Connexion</ButtonLink>}
          <ButtonLink href="/compte" variant="onDark" size="sm" className="!border-transparent !bg-transparent hover:!bg-white/10"><User className="size-4" />{auth.user ? (auth.user.email ?? "Mon espace").split("@")[0] : "Mon espace"}</ButtonLink>
          <ButtonLink href="/creer" size="sm">Créer un parcours</ButtonLink>
        </div>
        <div className="ml-auto flex items-center gap-1 lg:hidden"><Link href={auth.enabled && !auth.user ? "/connexion" : "/compte"} aria-label={auth.user ? "Mon espace" : auth.enabled ? "Connexion" : "Mon espace"} className="grid size-11 place-items-center rounded-full text-white hover:bg-white/10"><User className="size-5" /></Link></div>
      </div>
    </header>
  );
}
