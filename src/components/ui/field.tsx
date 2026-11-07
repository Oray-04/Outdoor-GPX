import type { ReactNode } from "react";

/** Astérisque rouge des champs obligatoires (masqué aux lecteurs d'écran, qui entendent « obligatoire »). */
export const Req = () => <><span className="ml-0.5 font-bold text-danger" aria-hidden="true">*</span><span className="sr-only"> (obligatoire)</span></>;

/** Légende à placer en tête d'un formulaire qui contient des champs obligatoires. */
export const RequiredLegend = ({ className = "" }: { className?: string }) => <p className={`text-xs text-ink-500 ${className}`}><span className="font-bold text-danger" aria-hidden="true">*</span> Champ obligatoire</p>;

/** Libellé + champ ; `required` ajoute l'astérisque, `error` un message sous le champ. L'attribut `required` doit aussi être posé sur le champ lui-même. */
export function Field({ l, required, error, hint, className = "", children }: { l: string; required?: boolean; error?: string | null; hint?: string; className?: string; children: ReactNode }) {
  return (
    <label className={`grid gap-1 text-sm font-medium ${className}`}>
      <span>{l}{required && <Req />}</span>
      {children}
      {hint && <span className="text-xs font-normal text-ink-500">{hint}</span>}
      {error && <span role="alert" className="text-xs font-normal text-danger">{error}</span>}
    </label>
  );
}
/** Un champ obligatoire est-il réellement rempli ? (les espaces seuls ne comptent pas, ce que l'attribut HTML `required` laisse passer) */
export const filled = (v: string | null | undefined) => !!v && v.trim().length > 0;
