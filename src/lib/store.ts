"use client";
import { useSyncExternalStore } from "react";

/**
 * Couche de persistance locale (localStorage).
 * Une seule interface : remplaçable par la base de données (étape 2) sans toucher aux écrans.
 */
const PREFIX = "crete:";
const listeners = new Map<string, Set<() => void>>();
const cache = new Map<string, { raw: string | null; value: unknown }>();

function read<T>(key: string, initial: T): T {
  if (typeof window === "undefined") return initial;
  let raw: string | null = null;
  try { raw = localStorage.getItem(PREFIX + key); } catch { return initial; }
  const c = cache.get(key);
  if (c && c.raw === raw) return c.value as T;
  let value: T = initial;
  if (raw) { try { value = JSON.parse(raw) as T; } catch { value = initial; } }
  cache.set(key, { raw, value });
  return value;
}

export function writeStore<T>(key: string, value: T): { ok: boolean; error?: string } {
  try {
    const raw = JSON.stringify(value);
    localStorage.setItem(PREFIX + key, raw);
    cache.set(key, { raw, value });
    listeners.get(key)?.forEach((l) => l());
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).name === "QuotaExceededError" ? "Stockage local plein : exportez puis supprimez des parcours." : "Stockage local indisponible." };
  }
}

export const readStore = read;

export function useStore<T>(key: string, initial: T): T {
  return useSyncExternalStore(
    (cb) => {
      let s = listeners.get(key); if (!s) listeners.set(key, (s = new Set()));
      s.add(cb);
      const onStorage = (e: StorageEvent) => { if (e.key === PREFIX + key) cb(); };
      window.addEventListener("storage", onStorage);
      return () => { s!.delete(cb); window.removeEventListener("storage", onStorage); };
    },
    () => read(key, initial),
    () => initial,
  );
}
