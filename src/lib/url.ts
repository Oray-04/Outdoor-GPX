/** Sous-dossier de publication (GitHub Pages : /nom-du-depot). Vide en local. */
export const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
/** À utiliser pour les liens « bruts » (location, <a> créés à la main). Les <Link> ajoutent déjà le préfixe. */
export const withBase = (path: string) => BASE + path;

/** Pages à identifiant passé en paramètre d'adresse (compatible hébergement statique). */
export const routeHref = (id: string) => `/parcours/voir/?id=${encodeURIComponent(id)}`;
export const eventHref = (id: string) => `/evenements/voir/?id=${encodeURIComponent(id)}`;
export const manageHref = (id: string) => `/organisateurs/gerer/?id=${encodeURIComponent(id)}`;
export const editorHref = (id: string) => `/creer/?id=${encodeURIComponent(id)}`;

export const validId = (s: string | null | undefined) => (s && /^[\w-]{3,64}$/.test(s) ? s : undefined);
export const collectionHref = (id: string) => `/collections/voir/?id=${encodeURIComponent(id)}`;
export const ownerHref = (id: string) => `/organisateur/voir/?id=${encodeURIComponent(id)}`;
