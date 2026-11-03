"use client";
import { useStore, readStore, writeStore } from "./store";

const MAX_PHOTOS = 6;
const key = (routeId: string) => `photos:${routeId}`;
const EMPTY: string[] = [];
export const usePhotos = (routeId: string) => useStore<string[]>(key(routeId), EMPTY);

/** Redimensionne (1280 px max, JPEG) avant stockage local pour ménager l'espace. */
export async function addPhoto(routeId: string, file: File): Promise<{ ok: boolean; error?: string }> {
  if (!file.type.startsWith("image/")) return { ok: false, error: "Ce fichier n'est pas une image." };
  const cur = readStore<string[]>(key(routeId), EMPTY);
  if (cur.length >= MAX_PHOTOS) return { ok: false, error: `${MAX_PHOTOS} photos maximum par parcours.` };
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return { ok: false, error: "Image illisible." };
  const k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  const r = writeStore(key(routeId), [...cur, c.toDataURL("image/jpeg", 0.75)]);
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}
export const removePhoto = (routeId: string, i: number) => writeStore(key(routeId), readStore<string[]>(key(routeId), EMPTY).filter((_, k) => k !== i));
