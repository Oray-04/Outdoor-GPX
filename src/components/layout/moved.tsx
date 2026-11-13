"use client";
import { useEffect } from "react";
import { withBase } from "@/lib/url";

/** Ancienne adresse d'une page déplacée : renvoie vers son nouvel emplacement (les liens et favoris existants continuent de fonctionner). */
export function Moved({ to, title, text }: { to: (q: URLSearchParams) => string; title: string; text: string }) {
  useEffect(() => { location.replace(withBase(to(new URLSearchParams(location.search)))); }, [to]);
  return <div className="mx-auto max-w-lg px-4 py-24 text-center"><h1 className="text-2xl">{title}</h1><p className="mt-2 text-ink-600">{text}</p></div>;
}
