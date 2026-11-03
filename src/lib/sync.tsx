"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cloud } from "./cloud";
import { useAuth } from "./auth";
import { syncOnce, type Doc, type Local, type Remote } from "./sync-core";
import { onLocalChange, setSingleMeta, singleMeta, tombKey, withApplying } from "./repo";
import { readStore, writeStore } from "./store";
import { thin, trackStats } from "./geo";
import type { SavedRoute } from "./types";

const LIST_KEYS = ["routes", "activities", "collections", "reviews", "reports", "events"] as const;
/** clé locale → type de document dans la base */
const SINGLES: Record<string, string> = { favorites: "favorites", profile: "profile", layers: "layers", "categories:terrains": "terrains" };
const KIND_TO_SINGLE = Object.fromEntries(Object.entries(SINGLES).map(([k, v]) => [v, k]));
type Item = { id: string; _u?: number; updatedAt?: number; createdAt?: number };

/** Adaptateur : stockage local du navigateur. */
export const localAdapter: Local = {
  snapshot() {
    const docs: Doc[] = [];
    for (const kind of LIST_KEYS) {
      for (const it of readStore<Item[]>(kind, [])) docs.push({ kind, id: it.id, data: it, ts: it._u ?? it.updatedAt ?? it.createdAt ?? 1, deleted: false });
      for (const [id, ts] of Object.entries(readStore<Record<string, number>>(tombKey(kind), {}))) docs.push({ kind, id, data: null, ts, deleted: true });
    }
    const meta = singleMeta();
    for (const [key, kind] of Object.entries(SINGLES)) if (meta[key] != null) docs.push({ kind, id: "_", data: readStore<unknown>(key, null), ts: meta[key], deleted: false });
    return docs;
  },
  apply(d) {
    withApplying(() => {
      const single = KIND_TO_SINGLE[d.kind];
      if (single) { if (!d.deleted) { writeStore(single, d.data); setSingleMeta(single, d.ts); } return; }
      const list = readStore<Item[]>(d.kind, []);
      if (d.deleted) {
        writeStore(d.kind, list.filter((x) => x.id !== d.id));
        writeStore(tombKey(d.kind), { ...readStore<Record<string, number>>(tombKey(d.kind), {}), [d.id]: d.ts });
      } else {
        const item = { ...(d.data as Item), _u: d.ts };
        writeStore(d.kind, list.some((x) => x.id === d.id) ? list.map((x) => (x.id === d.id ? item : x)) : [item, ...list]);
        const t = readStore<Record<string, number>>(tombKey(d.kind), {}); if (t[d.id] != null) { delete t[d.id]; writeStore(tombKey(d.kind), t); }
      }
    });
  },
};

const iso = (ms: number) => new Date(ms).toISOString();
const PAGE = 500;

/** Adaptateur : table `documents` de Supabase. */
export function remoteAdapter(uid: string): Remote {
  return {
    async pull(since) {
      const c = cloud()!; const out: Doc[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await c.from("documents").select("kind,id,data,updated_at,deleted").eq("owner_id", uid).gte("updated_at", iso(since)).order("updated_at").range(from, from + PAGE - 1);
        if (error) throw new Error(error.message);
        for (const r of data ?? []) out.push({ kind: r.kind, id: r.id, data: r.data, ts: Date.parse(r.updated_at), deleted: r.deleted });
        if ((data?.length ?? 0) < PAGE) break;
      }
      return out;
    },
    async push(docs) {
      const c = cloud()!; let batch: object[] = []; let size = 0;
      const flush = async () => { if (!batch.length) return; const { error } = await c.from("documents").upsert(batch, { onConflict: "owner_id,kind,id" }); if (error) throw new Error(error.message); batch = []; size = 0; };
      for (const d of docs) {
        const row = { owner_id: uid, kind: d.kind, id: d.id, data: d.deleted ? {} : d.data, updated_at: iso(d.ts), deleted: d.deleted };
        const n = JSON.stringify(row).length;
        if (size + n > 1_500_000) await flush();
        batch.push(row); size += n;
      }
      await flush();
    },
  };
}

/** Ligne `public_routes` (géométrie en EWKT, la base la convertit). */
export function toPublicRow(uid: string, r: SavedRoute) {
  const st = trackStats(r.coords, 3);
  let pts = thin(r.coords, 10);
  if (pts.length > 3000) pts = thin(r.coords, (st.distanceM / 3000) * 1.2);
  return {
    id: r.id, owner_id: uid, name: r.name.slice(0, 120) || "Parcours", sport: r.sport, region: r.region, country: r.country,
    distance_m: st.distanceM, gain_m: st.gainM, loss_m: st.lossM, min_ele: st.minEle, max_ele: st.maxEle, description: r.description.slice(0, 2000),
    geom: `SRID=4326;LINESTRING Z (${pts.map((p) => `${p[0]} ${p[1]} ${p[2]}`).join(", ")})`, updated_at: iso(r.updatedAt),
  };
}

const PUBLISHED = "sync:published";
/** Publie les parcours « public » et retire ceux qui ne le sont plus (ou ont été supprimés). */
export async function syncPublic(uid: string) {
  const c = cloud()!;
  const routes = readStore<SavedRoute[]>("routes", []);
  const want = routes.filter((r) => r.visibility === "public" && r.coords.length > 1);
  const had = new Set(readStore<string[]>(PUBLISHED, []));
  const rows = want.map((r) => toPublicRow(uid, r));
  for (let i = 0; i < rows.length; i += 5) {
    const { error } = await c.from("public_routes").upsert(rows.slice(i, i + 5), { onConflict: "id" });
    if (error) throw new Error(error.message);
  }
  const keep = new Set(want.map((r) => r.id));
  const drop = [...had].filter((id) => !keep.has(id));
  if (drop.length) { const { error } = await c.from("public_routes").delete().in("id", drop).eq("owner_id", uid); if (error) throw new Error(error.message); }
  writeStore(PUBLISHED, [...keep]);
}

export interface SyncState { status: "off" | "idle" | "syncing" | "ok" | "error"; lastSync: number | null; error: string | null; pulled: number; pushed: number }
interface Ctx extends SyncState { syncNow: () => Promise<void> }
const SyncCtx = createContext<Ctx>({ status: "off", lastSync: null, error: null, pulled: 0, pushed: 0, syncNow: async () => {} });
export const useSync = () => useContext(SyncCtx);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<SyncState>({ status: "off", lastSync: null, error: null, pulled: 0, pushed: 0 });
  const running = useRef(false), again = useRef(false);
  const uid = user?.id;

  const syncNow = useCallback(async () => {
    if (!uid) return;
    if (running.current) { again.current = true; return; }
    running.current = true; setState((s) => ({ ...s, status: "syncing", error: null }));
    try {
      const lastKey = `sync:last:${uid}`;
      const r = await syncOnce(remoteAdapter(uid), localAdapter, readStore<number>(lastKey, 0));
      await syncPublic(uid);
      writeStore(lastKey, r.lastSync);
      setState({ status: "ok", lastSync: r.lastSync, error: null, pulled: r.pulled, pushed: r.pushed });
    } catch (e) {
      setState((s) => ({ ...s, status: "error", error: (e as Error).message || "Synchronisation impossible." }));
    } finally {
      running.current = false;
      if (again.current) { again.current = false; setTimeout(syncNow, 500); }
    }
  }, [uid]);

  useEffect(() => {
    if (!uid) { setState({ status: "off", lastSync: null, error: null, pulled: 0, pushed: 0 }); return; }
    setState((s) => ({ ...s, status: "idle", lastSync: readStore<number>(`sync:last:${uid}`, 0) || null }));
    syncNow();
    let t: ReturnType<typeof setTimeout> | undefined;
    const off = onLocalChange(() => { clearTimeout(t); t = setTimeout(syncNow, 3000); });
    const onFocus = () => syncNow();
    window.addEventListener("focus", onFocus);
    const iv = setInterval(syncNow, 120_000);
    return () => { off(); clearTimeout(t); window.removeEventListener("focus", onFocus); clearInterval(iv); };
  }, [uid, syncNow]);

  const value = useMemo(() => ({ ...state, syncNow }), [state, syncNow]);
  return <SyncCtx.Provider value={value}>{children}</SyncCtx.Provider>;
}
