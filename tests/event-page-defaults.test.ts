// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { PRESETS } from "../src/lib/event-page";

describe("réglages par défaut de la page", () => {
  it("enregistrer, repartir des réglages (nouveaux identifiants), appliquer aux nouveaux événements, effacer", async () => {
    localStorage.clear(); const m = await import("../src/lib/event-page");
    expect(m.loadPageDefaults()).toBeNull();
    const d = m.addBlock({ ...m.defaultDesign(), theme: { ...m.defaultDesign().theme, primary: "#2457d6", background: "sombre" } }, "compte");
    expect(m.savePageDefaults(d, true)).toBe(true);
    const back = m.loadPageDefaults()!; expect(back.autoApply).toBe(true); expect(back.design.theme).toMatchObject({ primary: "#2457d6", background: "sombre" });
    const s = m.startingDesign(); expect(s.blocks.map((b) => b.kind)).toEqual(d.blocks.map((b) => b.kind)); expect(s.blocks[0].id).not.toBe(d.blocks[0].id);
    m.clearPageDefaults(); expect(m.loadPageDefaults()).toBeNull(); expect(m.startingDesign().theme.primary).toBe(PRESETS[0].primary);
  });
});
