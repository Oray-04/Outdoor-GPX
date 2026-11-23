import { describe, it, expect } from "vitest";
import { normalizeDesign, defaultDesign, moveBlock, addBlock, removeBlock, patchBlock, addable, canEditEventPage, contrast, onColor, readable, themeVars, keyFacts, daysUntil, DEFAULT_BLOCKS, PRESETS } from "../src/lib/event-page";
import { toPublicEvent } from "../src/lib/sync";
import { eventFromRow } from "../src/lib/community";
import type { EventModel } from "../src/lib/events";

const ev = (p: Partial<EventModel> = {}): EventModel => ({ id: "e1", name: "Trail", organizer: "Asso", date: "2027-06-20", place: "Ici", region: "", description: "", rules: "", practical: "", registrationUrl: "", races: [], posts: [], volunteers: [], team: [], origin: "mine", createdAt: 0, ...p });

describe("page d'événement personnalisée : modèle", () => {
  it("page par défaut = blocs de la page standard, dans le même ordre", () => {
    expect(defaultDesign().blocks.map((b) => b.kind)).toEqual(DEFAULT_BLOCKS);
  });
  it("monter / descendre, ajouter (bloc unique ou multiple), retirer, masquer", () => {
    let d = defaultDesign(); const [a, b] = d.blocks;
    d = moveBlock(d, b.id, -1); expect(d.blocks[0].id).toBe(b.id); expect(moveBlock(d, d.blocks[0].id, -1)).toBe(d);
    expect(addBlock(d, "presentation")).toBe(d); // déjà présent
    d = addBlock(addBlock(d, "texte"), "texte"); expect(d.blocks.filter((x) => x.kind === "texte")).toHaveLength(2);
    expect(addable(d)).toContain("texte"); expect(addable(d)).not.toContain("courses");
    d = patchBlock(removeBlock(d, a.id), d.blocks[0].id, { hidden: true }); expect(d.blocks.some((x) => x.id === a.id)).toBe(false); expect(d.blocks[0].hidden).toBe(true);
  });
  it("nettoyage des données reçues : couleurs, blocs inconnus ou en double, image externe refusée", () => {
    const n = normalizeDesign({ theme: { primary: "red", accent: "#E5548E", background: "néon", banner: "image", bannerImage: "https://tracker.example/x.png" }, blocks: [{ id: "x", kind: "presentation" }, { id: "x", kind: "texte", text: "<b>ok</b>" }, { id: "y", kind: "presentation" }, { kind: "script" }] })!;
    expect(n.theme).toMatchObject({ primary: PRESETS[0].primary, accent: "#E5548E", background: "clair", banner: "degrade" }); expect(n.theme.bannerImage).toBeUndefined();
    expect(n.blocks.map((b) => b.kind)).toEqual(["presentation", "texte"]); expect(new Set(n.blocks.map((b) => b.id)).size).toBe(2);
    expect(normalizeDesign({ theme: { banner: "image", bannerImage: "data:image/jpeg;base64,AAAA" }, blocks: [] })!.theme.banner).toBe("image");
    expect(normalizeDesign(null)).toBeUndefined(); expect(normalizeDesign("x")).toBeUndefined();
  });
  it("texte toujours lisible, quelles que soient les couleurs (contraste AA)", () => {
    for (const c of ["#ffffff", "#ffe600", "#e5548e", "#2457d6", "#000000", "#8fd3e8"]) expect(contrast(c, onColor(c))).toBeGreaterThanOrEqual(3);
    for (const bg of ["clair", "teinte", "sombre"] as const) for (const p of PRESETS) { const v = themeVars({ primary: p.primary, accent: p.accent, background: bg, banner: "degrade" }); expect(contrast(v.link, v.card)).toBeGreaterThanOrEqual(4.5); expect(contrast(v.ink, v.card)).toBeGreaterThanOrEqual(7); }
    expect(contrast(readable("#ffe600", "#ffffff"), "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
  it("chiffres clés et compte à rebours", () => {
    const k = keyFacts({ races: [{ distanceKm: 10, gainM: 400 }, { distanceKm: 42.2, gainM: 2100 }] as EventModel["races"], date: "", place: "" });
    expect({ ...k, gain: k.gain?.replace(/[\u202f\u00a0]/g, " ") }).toEqual({ courses: 2, distances: "10 à 42,2 km", gain: "2 100 m D+" });
    expect(daysUntil("2027-01-10", new Date(2027, 0, 1, 23, 0))).toBe(9); expect(daysUntil("2026-12-31", new Date(2027, 0, 1))).toBe(-1); expect(daysUntil("bientôt")).toBeNull();
  });
});

describe("droits : édition réservée aux administrateurs du trail", () => {
  it("créateur (cet appareil) ou propriétaire connecté", () => {
    expect(canEditEventPage(ev())).toBe(true); expect(canEditEventPage(ev({ ownerId: "u1" }), { id: "u1" })).toBe(true);
  });
  it("événement d'un autre organisateur, visiteur connecté non administrateur : refusé", () => {
    expect(canEditEventPage(ev({ origin: "community" }))).toBe(false);
    expect(canEditEventPage(ev({ ownerId: "u1" }), { id: "u2", email: "x@y.fr" })).toBe(false);
    expect(canEditEventPage(ev({ ownerId: "u1", team: [{ id: "m", name: "B", email: "x@y.fr", role: "logistique" }] }), { id: "u2", email: "x@y.fr" })).toBe(false);
  });
  it("membre de l'équipe au rôle Administrateur (même e-mail) : autorisé", () => {
    expect(canEditEventPage(ev({ ownerId: "u1", team: [{ id: "m", name: "B", email: "Anne@Trail.fr ", role: "admin" }] }), { id: "u2", email: "anne@trail.fr" })).toBe(true);
  });
});

describe("publication", () => {
  it("la page personnalisée est publiée nettoyée, et relue nettoyée", () => {
    const row = toPublicEvent("u", ev({ page: { ...defaultDesign(), theme: { ...defaultDesign().theme, primary: "#2457d6" } } }));
    expect((row as { page: { theme: { primary: string } } }).page.theme.primary).toBe("#2457d6");
    expect((toPublicEvent("u", ev()) as { page: unknown }).page).toBeNull();
    const back = eventFromRow({ ...(row as unknown as Parameters<typeof eventFromRow>[0]), page: { theme: { primary: "javascript:" }, blocks: [{ kind: "texte", text: "x" }] } });
    expect(back.page?.theme.primary).toBe(PRESETS[0].primary); expect(back.page?.blocks[0].kind).toBe("texte");
  });
});
