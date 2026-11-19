import { describe, it, expect, vi, afterEach } from "vitest";
import { readJson, ServiceFormatError } from "../src/lib/http";
import { fetchWaymarked } from "../src/lib/analysis";

const METRICS = "# HELP jmx_config_reload_failure_total Number of times configuration have failed to be reloaded.\n# TYPE jmx_config_reload_failure_total counter\n";
const res = (body: string, ct = "application/json", status = 200) => new Response(body, { status, headers: { "content-type": ct } });
afterEach(() => vi.unstubAllGlobals());

describe("réponses des services externes", () => {
  it("JSON valide : lu normalement", async () => { expect(await readJson<{ a: number }>(res('{"a":1}'), "Test")).toEqual({ a: 1 }); });
  it("page de métriques « # HELP jmx… » (même annoncée en JSON) : erreur typée et lisible, pas « Unexpected token »", async () => {
    await expect(readJson(res(METRICS), "Le service")).rejects.toBeInstanceOf(ServiceFormatError);
    await expect(readJson(res(METRICS, "text/plain"), "Le service")).rejects.toThrow(/réponse inattendue/);
    await expect(readJson(res("<html>502 Bad Gateway</html>", "text/html"), "Le service")).rejects.toBeInstanceOf(ServiceFormatError);
    await expect(readJson(res("{tronqué", "application/json"), "Le service")).rejects.toBeInstanceOf(ServiceFormatError);
  });
  it("analyse : une réponse de métriques est retentée ; les vraies données suivantes sont utilisées", async () => {
    const f = vi.fn().mockResolvedValueOnce(res(METRICS, "text/plain")).mockResolvedValueOnce(res('{"results":[{"ref":"GR5","name":"GR 5","group":"INT"}]}'));
    vi.stubGlobal("fetch", f);
    const r = await fetchWaymarked([6, 45, 6.1, 45.1]);
    expect(f).toHaveBeenCalledTimes(2); expect(r).toEqual([{ ref: "GR5", name: "GR 5", group: "INT" }]);
  });
  it("analyse : métriques à chaque essai → message clair nommant le service", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(res(METRICS, "text/plain"))));
    await expect(fetchWaymarked([6, 45, 6.1, 45.1])).rejects.toThrow(/itinéraires balisés a renvoyé une réponse inattendue/);
  });
});
