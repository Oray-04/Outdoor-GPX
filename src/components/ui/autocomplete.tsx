"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import clsx from "clsx";
import { Req } from "./field";

export interface Option<T> { key: string; label: string; hint?: string; value: T }
interface Props<T> {
  label: string; value: string; onInput: (v: string) => void; onSelect: (o: Option<T>) => void;
  /** Suggestions pour la saisie ; `null` = pas assez de caractères. Peut lever une erreur (affichée). */
  fetchOptions: (q: string, signal: AbortSignal) => Promise<Option<T>[] | null>;
  placeholder?: string; required?: boolean; invalid?: boolean; minChars?: number; className?: string; help?: string; name?: string;
}

/** Champ de recherche avec suggestions (combobox accessible : flèches, Entrée, Échap ; la saisie n'est jamais validée à la place de l'utilisateur). */
export function Autocomplete<T>({ label, value, onInput, onSelect, fetchOptions, placeholder, required, invalid, minChars = 2, className, help, name }: Props<T>) {
  const id = useId(), listId = `${id}-list`;
  const [opts, setOpts] = useState<Option<T>[]>([]); const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null); const [active, setActive] = useState(-1); const [empty, setEmpty] = useState(false);
  const box = useRef<HTMLDivElement>(null); const skip = useRef(false);

  useEffect(() => {
    if (skip.current) { skip.current = false; return; }
    const q = value.trim();
    if (q.length < minChars) { setOpts([]); setOpen(false); setErr(null); setEmpty(false); return; }
    const c = new AbortController(); setBusy(true); setErr(null);
    const t = setTimeout(async () => {
      try {
        const r = await fetchOptions(q, c.signal);
        if (r === null) { setOpts([]); setEmpty(false); setOpen(false); }
        else { setOpts(r); setEmpty(!r.length); setActive(-1); setOpen(true); }
      } catch (e) { if ((e as Error).name !== "AbortError") { setErr((e as Error).message || "Recherche indisponible."); setOpts([]); setOpen(true); } }
      finally { if (!c.signal.aborted) setBusy(false); }
    }, 250);
    return () => { clearTimeout(t); c.abort(); setBusy(false); };
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const h = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);

  const pick = (o: Option<T>) => { skip.current = true; setOpen(false); setOpts([]); onSelect(o); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(opts.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter" && open && active >= 0 && opts[active]) { e.preventDefault(); pick(opts[active]); }
    else if (e.key === "Escape") setOpen(false);
  };
  return (
    <div ref={box} className={clsx("relative grid gap-1 text-sm", className)}>
      <label htmlFor={id} className="font-medium">{label}{required && <Req />}</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
        <input id={id} name={name} role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={active >= 0 ? `${id}-o${active}` : undefined} aria-required={required} aria-invalid={invalid || undefined}
          autoComplete="off" value={value} onChange={(e) => onInput(e.target.value)} onKeyDown={onKey} onFocus={() => { if (opts.length || err) setOpen(true); }} placeholder={placeholder}
          className="h-10 w-full rounded-lg border border-ink-200 bg-white pl-9 pr-9 text-sm" />
        {busy && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-ink-400" aria-label="Recherche en cours" />}
      </div>
      {help && <p className="text-xs text-ink-500">{help}</p>}
      {open && (
        <ul id={listId} role="listbox" aria-label={`Suggestions : ${label}`} className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-xl border border-ink-200 bg-white p-1 shadow-lg">
          {err && <li role="alert" className="px-3 py-2 text-sm text-danger">{err}</li>}
          {empty && !err && <li className="px-3 py-2 text-sm text-ink-500">Aucune suggestion.</li>}
          {opts.map((o, i) => (
            <li key={o.key} id={`${id}-o${i}`} role="option" aria-selected={i === active} onMouseDown={(e) => { e.preventDefault(); pick(o); }} onMouseEnter={() => setActive(i)}
              className={clsx("cursor-pointer rounded-lg px-3 py-2", i === active ? "bg-pine-50" : "hover:bg-ink-50")}>
              <span className="block font-medium">{o.label}</span>{o.hint && <span className="block text-xs text-ink-500">{o.hint}</span>}
            </li>))}
        </ul>)}
    </div>
  );
}
