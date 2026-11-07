"use client";
import { useEffect, useState } from "react";
import { Autocomplete, type Option } from "./autocomplete";
import { communeSuggestions, loadRegions, matchRegions, type Commune, type Region } from "@/lib/communes";

const req = (on?: boolean) => on && <span className="ml-0.5 text-danger" aria-hidden="true">*</span>;

/**
 * Lieu (commune, par nom ou code postal) et région avec suggestions. Un code postal partagé liste toutes ses communes : rien n'est choisi à la place de l'utilisateur.
 * Choisir une commune renseigne aussi sa région (modifiable). La saisie libre reste possible (lieux hors France, données existantes).
 */
export function LocationFields({ place, region, onChange, placeRequired, regionRequired, placeError, className }: {
  place: string; region: string; onChange: (v: { place: string; region: string }) => void; placeRequired?: boolean; regionRequired?: boolean; placeError?: string | null; className?: string;
}) {
  const [picked, setPicked] = useState<Commune | null>(null);
  const [regions, setRegions] = useState<Region[] | null>(null); const [regErr, setRegErr] = useState<string | null>(null);
  useEffect(() => { loadRegions().then(setRegions).catch((e) => setRegErr((e as Error).message)); }, []);
  const placeOpts = async (q: string, signal: AbortSignal): Promise<Option<Commune>[] | null> => {
    const r = await communeSuggestions(q, signal, false); if (!r) return null;
    return r.map((x) => ({ key: x.key, label: x.label, hint: x.hint, value: x.communes[0] }));
  };
  const regionOpts = async (q: string): Promise<Option<Region>[] | null> => {
    if (regErr) throw new Error("Liste des régions indisponible : saisissez le nom à la main.");
    const all = regions ?? await loadRegions(); return matchRegions(all, q).map((r) => ({ key: r.code, label: r.nom, value: r }));
  };
  return (
    <>
      <div className={className}>
        <Autocomplete<Commune> invalid={!!placeError} label="Lieu (commune ou code postal)" required={placeRequired} value={place} onInput={(v) => { setPicked(null); onChange({ place: v, region }); }} fetchOptions={placeOpts} placeholder="04100 ou Manosque"
          help={picked ? `✓ ${picked.nom} · ${picked.departement} (${picked.codesPostaux.join(", ")})` : "Saisissez 5 chiffres pour voir toutes les communes du code postal, ou le début d'un nom."}
          onSelect={(o) => { setPicked(o.value); onChange({ place: `${o.value.nom} (${o.label.match(/\((\d{5})\)/)?.[1] ?? o.value.codesPostaux[0] ?? ""})`.replace(" ()", ""), region: o.value.region || region }); }} />
        {placeError && <p role="alert" className="mt-1 text-xs text-danger">{placeError}</p>}
      </div>
      <div className={className}>
        <Autocomplete<Region> label="Région" required={regionRequired} value={region} onInput={(v) => onChange({ place, region: v })} fetchOptions={regionOpts} minChars={2} placeholder="Provence…" onSelect={(o) => onChange({ place, region: o.value.nom })} />
      </div>
    </>
  );
}
export { req as requiredMark };
