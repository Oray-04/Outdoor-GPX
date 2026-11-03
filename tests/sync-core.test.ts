import { describe, it, expect } from "vitest";
import { syncOnce, type Doc, type Local, type Remote } from "../src/lib/sync-core";

class FakeRemote implements Remote {
  docs = new Map<string, Doc>();
  async pull(since: number) { return [...this.docs.values()].filter((d) => d.ts >= since); }
  async push(docs: Doc[]) { for (const d of docs) this.docs.set(`${d.kind}/${d.id}`, d); }
}
class FakeLocal implements Local {
  items = new Map<string, Doc>();
  put(kind: string, id: string, data: unknown, ts: number, deleted = false) { this.items.set(`${kind}/${id}`, { kind, id, data, ts, deleted }); }
  snapshot() { return [...this.items.values()]; }
  apply(d: Doc) { this.items.set(`${d.kind}/${d.id}`, d); }
}
const T = 1_000_000_000_000;

describe("synchronisation", () => {
  it("première synchro : le local est envoyé, le cloud récupéré", async () => {
    const r = new FakeRemote(), l = new FakeLocal();
    l.put("routes", "a", { n: "local" }, T + 1);
    r.docs.set("routes/b", { kind: "routes", id: "b", data: { n: "cloud" }, ts: T + 2, deleted: false });
    const res = await syncOnce(r, l, 0, T + 10);
    expect(res).toMatchObject({ pulled: 1, pushed: 1 });
    expect(l.items.get("routes/b")?.data).toEqual({ n: "cloud" });
    expect(r.docs.get("routes/a")?.data).toEqual({ n: "local" });
  });
  it("conflit : la version la plus récente gagne (cloud)", async () => {
    const r = new FakeRemote(), l = new FakeLocal();
    l.put("routes", "a", { v: "ancien" }, T + 1);
    r.docs.set("routes/a", { kind: "routes", id: "a", data: { v: "récent" }, ts: T + 5, deleted: false });
    await syncOnce(r, l, T, T + 10);
    expect(l.items.get("routes/a")?.data).toEqual({ v: "récent" });
    expect(r.docs.get("routes/a")?.data).toEqual({ v: "récent" });
  });
  it("conflit : la version la plus récente gagne (local)", async () => {
    const r = new FakeRemote(), l = new FakeLocal();
    r.docs.set("routes/a", { kind: "routes", id: "a", data: { v: "ancien" }, ts: T + 1, deleted: false });
    l.put("routes", "a", { v: "récent" }, T + 9);
    const res = await syncOnce(r, l, T, T + 10);
    expect(res.pushed).toBe(1);
    expect(r.docs.get("routes/a")?.data).toEqual({ v: "récent" });
  });
  it("une suppression se propage", async () => {
    const r = new FakeRemote(), l = new FakeLocal();
    r.docs.set("routes/a", { kind: "routes", id: "a", data: { v: 1 }, ts: T + 1, deleted: false });
    l.put("routes", "a", null, T + 5, true);
    await syncOnce(r, l, T, T + 10);
    expect(r.docs.get("routes/a")?.deleted).toBe(true);
  });
  it("une suppression distante est appliquée en local", async () => {
    const r = new FakeRemote(), l = new FakeLocal();
    l.put("routes", "a", { v: 1 }, T + 1);
    r.docs.set("routes/a", { kind: "routes", id: "a", data: null, ts: T + 6, deleted: true });
    await syncOnce(r, l, T, T + 10);
    expect(l.items.get("routes/a")?.deleted).toBe(true);
  });
  it("rien à faire quand tout est déjà synchronisé", async () => {
    const r = new FakeRemote(), l = new FakeLocal();
    l.put("routes", "a", { v: 1 }, T + 1);
    await syncOnce(r, l, 0, T + 2);
    const res = await syncOnce(r, l, T + 2, T + 3);
    expect(res).toMatchObject({ pulled: 0, pushed: 0 });
  });
  it("deux appareils convergent", async () => {
    const r = new FakeRemote(), a = new FakeLocal(), b = new FakeLocal();
    a.put("favorites", "_", ["x"], T + 1);
    await syncOnce(r, a, 0, T + 2);
    await syncOnce(r, b, 0, T + 3);
    expect(b.items.get("favorites/_")?.data).toEqual(["x"]);
    b.put("favorites", "_", ["x", "y"], T + 10);
    await syncOnce(r, b, T + 3, T + 11);
    await syncOnce(r, a, T + 2, T + 12);
    expect(a.items.get("favorites/_")?.data).toEqual(["x", "y"]);
  });
});
