// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { __setCloudClientForTests } from "../src/lib/cloud";
import { remoteAdapter, localAdapter, syncPublic, toPublicRow } from "../src/lib/sync";
import { syncOnce } from "../src/lib/sync-core";
import { writeStore } from "../src/lib/store";
import { communityInBbox, communityRoute } from "../src/lib/community";
import type { SavedRoute } from "../src/lib/types";

/** API REST simulée : mémorise les requêtes et applique quelques filtres de PostgREST. */
function fakeApi() {
  const log: { method: string; url: URL; headers: Headers; body: unknown }[] = [];
  const docs = new Map<string, Record<string, unknown>>();
  const pub = new Map<string, Record<string, unknown>>();
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET"; const headers = new Headers(init?.headers);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    log.push({ method, url, headers, body });
    const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json" } });
    const table = url.pathname.split("/").pop()!;
    if (url.pathname.includes("/rpc/")) return json(url.pathname.endsWith("public_routes_in_bbox") ? [{ id: "r1", name: "Pub", sport: "trail", distance_m: 1000, gain_m: 50, owner_id: "u", geometry: { type: "LineString", coordinates: [[6, 45], [6.1, 45.1]] } }] : [{ id: "r1", name: "Pub", sport: "trail", region: "", country: "", description: "d", geometry: { type: "LineString", coordinates: [[6, 45, 1000], [6.1, 45.1, 1100], [6.2, 45.1, 1050]] } }]);
    if (table === "documents" && method === "GET") {
      const gte = url.searchParams.get("updated_at")?.replace("gte.", ""); const off = +(url.searchParams.get("offset") ?? 0), lim = +(url.searchParams.get("limit") ?? 1000);
      return json([...docs.values()].filter((d) => !gte || Date.parse(d.updated_at as string) >= Date.parse(gte)).slice(off, off + lim));
    }
    if (table === "documents" && method === "POST") { for (const r of body as Record<string, unknown>[]) docs.set(`${r.kind}/${r.id}`, r); return new Response(null, { status: 201 }); }
    if (table === "public_routes" && method === "POST") { for (const r of body as Record<string, unknown>[]) pub.set(r.id as string, r); return new Response(null, { status: 201 }); }
    if (table === "public_routes" && method === "DELETE") return new Response(null, { status: 204 });
    return json([]);
  };
  return { fetchImpl, log, docs, pub };
}

const route = (id: string, visibility: "public" | "prive", n = 50): SavedRoute => ({
  id, name: `Parcours ${id}`, description: "d", sport: "trail", segs: [], waypoints: [], pois: [], terrain: [], visibility, region: "", country: "", source: "creation", createdAt: 1, updatedAt: 1000,
  coords: Array.from({ length: n }, (_, i) => [6 + i * 0.001, 45 + i * 0.0005, 1000 + i]),
});

describe("adaptateurs cloud (API simulée)", () => {
  let api: ReturnType<typeof fakeApi>;
  beforeEach(() => { localStorage.clear(); api = fakeApi(); __setCloudClientForTests(createClient("http://api.test", "cle-anon", { global: { fetch: api.fetchImpl as typeof fetch }, auth: { persistSession: false } })); });

  it("envoie les documents locaux (clé de conflit propriétaire/type/id) puis les récupère sur un autre appareil", async () => {
    writeStore("routes", [{ ...route("abc-1", "prive"), _u: 5000 }]);
    writeStore("favorites", ["abc-1"]); writeStore("sync:single", { favorites: 6000 });
    const r = await syncOnce(remoteAdapter("user-1"), localAdapter, 0, 9999);
    expect(r.pushed).toBe(2);
    const post = api.log.find((l) => l.method === "POST")!;
    expect(post.url.searchParams.get("on_conflict")).toBe("owner_id,kind,id");
    expect(post.headers.get("prefer")).toContain("resolution=merge-duplicates");
    expect((post.body as { owner_id: string }[]).every((x) => x.owner_id === "user-1")).toBe(true);
    // autre appareil
    localStorage.clear();
    const r2 = await syncOnce(remoteAdapter("user-1"), localAdapter, 0, 10000);
    expect(r2.pulled).toBe(2);
    expect(JSON.parse(localStorage.getItem("crete:routes")!)[0].id).toBe("abc-1");
    expect(JSON.parse(localStorage.getItem("crete:favorites")!)).toEqual(["abc-1"]);
    const pull = api.log.find((l) => l.method === "GET")!;
    expect(pull.url.searchParams.get("owner_id")).toBe("eq.user-1");
  });

  it("ne publie que les parcours « public »", async () => {
    writeStore("routes", [route("pub-1", "public"), route("priv-1", "prive")]);
    await syncPublic("user-1");
    expect([...api.pub.keys()]).toEqual(["pub-1"]);
    expect(JSON.parse(localStorage.getItem("crete:sync:published")!)).toEqual(["pub-1"]);
  });

  it("retire un parcours repassé en privé", async () => {
    writeStore("routes", [route("pub-1", "public")]); await syncPublic("user-1");
    writeStore("routes", [route("pub-1", "prive")]); api.log.length = 0;
    await syncPublic("user-1");
    const del = api.log.find((l) => l.method === "DELETE")!;
    expect(del.url.searchParams.get("id")).toBe("in.(pub-1)");
    expect(del.url.searchParams.get("owner_id")).toBe("eq.user-1");
  });

  it("géométrie publiée : EWKT 3D, au plus 3000 points, altitudes conservées", () => {
    const row = toPublicRow("u", route("big", "public", 9000));
    expect(row.geom.startsWith("SRID=4326;LINESTRING Z (")).toBe(true);
    const n = row.geom.split(",").length; expect(n).toBeLessThanOrEqual(3100); expect(n).toBeGreaterThan(2);
    expect(row.geom).toMatch(/\d+(\.\d+)? \d+(\.\d+)? 10\d\d/);
    expect(row.distance_m).toBeGreaterThan(0);
  });

  it("calque communauté : appels RPC et fiche", async () => {
    const rows = await communityInBbox([6, 45, 7, 46]);
    expect(rows[0].name).toBe("Pub");
    const rpc = api.log.find((l) => l.url.pathname.endsWith("public_routes_in_bbox"))!;
    expect(rpc.body).toMatchObject({ west: 6, south: 45, east: 7, north: 46 });
    const vm = await communityRoute("r1");
    expect(vm?.origin).toBe("community"); expect(vm?.coords).toHaveLength(3); expect(vm?.stats.maxEle).toBe(1100);
  });
});
