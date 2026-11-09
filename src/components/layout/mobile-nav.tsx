"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Compass, PenLine, Sparkles, Route as RouteIcon, Menu, X, CalendarDays, Users, FileUp, Footprints, WifiOff, User, Briefcase, CircleDollarSign, Palette, Mountain } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@/lib/auth";

const MAIN = [
  { href: "/explorer", label: "Explorer", icon: Compass },
  { href: "/creer", label: "Créer", icon: PenLine },
  { href: "/generer", label: "Générer", icon: Sparkles },
  { href: "/parcours", label: "Parcours", icon: RouteIcon },
] as const;

const MORE = [
  { href: "/itineraires", label: "Itinéraires de référence", icon: Mountain },
  { href: "/evenements", label: "Événements", icon: CalendarDays },
  { href: "/organisateurs", label: "Organisateurs", icon: Briefcase },
  { href: "/communaute", label: "Communauté", icon: Users },
  { href: "/fichiers", label: "Fichiers GPS", icon: FileUp },
  { href: "/suivi", label: "Suivi GPS", icon: Footprints },
  { href: "/hors-ligne", label: "Hors ligne", icon: WifiOff },
  { href: "/compte", label: "Mon espace", icon: User },
  { href: "/tarifs", label: "Tarifs", icon: CircleDollarSign },
  { href: "/charte", label: "Charte", icon: Palette },
] as const;

/** Barre de navigation basse (téléphone et tablette) : les 4 outils principaux + un menu « Plus ». */
export function MobileNav() {
  const path = usePathname();
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [open]);
  const active = (h: string) => path.startsWith(h);
  const moreActive = MORE.some((m) => active(m.href));

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label="Plus de pages">
          <button type="button" aria-label="Fermer le menu" className="absolute inset-0 bg-ink-950/55 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-paper p-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))] shadow-lift">
            <div className="mb-3 flex items-center justify-between"><p className="font-display text-lg font-bold">Menu</p><button type="button" aria-label="Fermer" onClick={() => setOpen(false)} className="grid size-10 place-items-center rounded-full hover:bg-ink-100"><X className="size-5" /></button></div>
            <ul className="grid grid-cols-3 gap-2">
              {MORE.map(({ href, label, icon: I }) => (
                <li key={href}><Link href={href === "/compte" && auth.enabled && !auth.user ? "/connexion" : href} className={clsx("flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-xl p-2 text-center text-xs font-medium", active(href) ? "bg-pine-50 text-pine-700" : "bg-ink-50 text-ink-700")}><I className="size-5" />{label}</Link></li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <nav aria-label="Navigation principale" className="glass-dark fixed inset-x-0 bottom-0 z-[70] border-t border-brass-400/25 pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="mx-auto grid h-14 max-w-xl grid-cols-5">
          {MAIN.map(({ href, label, icon: I }) => (
            <li key={href}><Link href={href} aria-current={active(href) ? "page" : undefined} className={clsx("relative flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors", active(href) ? "text-white before:absolute before:top-0 before:h-0.5 before:w-8 before:rounded-full before:bg-brass-400" : "text-white/55")}><I className={clsx("size-5", active(href) && "stroke-[2.2] text-brass-400")} />{label}</Link></li>
          ))}
          <li><button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className={clsx("flex h-full w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors", open || moreActive ? "text-white" : "text-white/55")}><Menu className="size-5" />Plus</button></li>
        </ul>
      </nav>
    </>
  );
}
