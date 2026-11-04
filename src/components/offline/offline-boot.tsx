"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { WifiOff } from "lucide-react";
import { registerServiceWorker } from "@/lib/offline";

/** Enregistre le service worker (production) et signale la perte de connexion. */
export function OfflineBoot() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    registerServiceWorker();
    const on = () => setOnline(true), off = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  if (online) return null;
  return <div role="status" className="flex items-center justify-center gap-2 bg-ink-800 px-4 py-2 text-center text-sm font-medium text-white"><WifiOff className="size-4 shrink-0" />Hors ligne : seules les cartes et parcours téléchargés sont disponibles. <Link href="/hors-ligne" className="underline">Espace hors ligne</Link></div>;
}
