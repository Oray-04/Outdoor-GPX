/**
 * Cœur de la synchronisation « local d'abord ».
 * Règle de conflit : la modification la plus récente gagne (horodatage client).
 * Indépendant de Supabase et du navigateur : testé avec un faux serveur.
 */
export interface Doc { kind: string; id: string; data: unknown; ts: number; deleted: boolean }

export interface Remote {
  /** Documents modifiés depuis `since` (ms). */
  pull(since: number): Promise<Doc[]>;
  push(docs: Doc[]): Promise<void>;
}
export interface Local {
  /** Tous les éléments locaux (y compris suppressions) avec leur horodatage. */
  snapshot(): Doc[];
  apply(doc: Doc): void;
}
export interface SyncResult { pulled: number; pushed: number; lastSync: number }

const key = (d: { kind: string; id: string }) => `${d.kind}/${d.id}`;
/** Marge de sécurité sur la fenêtre de récupération (décalage d'horloge, écritures simultanées). */
export const PULL_MARGIN_MS = 60_000;

export async function syncOnce(remote: Remote, local: Local, lastSync: number, now = Date.now()): Promise<SyncResult> {
  const cloud = await remote.pull(Math.max(0, lastSync - PULL_MARGIN_MS));
  const cloudMap = new Map(cloud.map((d) => [key(d), d]));
  const mine = local.snapshot();
  const mineMap = new Map(mine.map((d) => [key(d), d]));

  // 1) Le cloud est plus récent que le local (ou absent en local) : on l'applique.
  let pulled = 0;
  for (const c of cloud) {
    const l = mineMap.get(key(c));
    if (!l || c.ts > l.ts) { local.apply(c); pulled++; }
  }

  // 2) Le local est plus récent que le cloud, ou modifié depuis la dernière synchronisation : on l'envoie.
  const toPush: Doc[] = [];
  for (const l of mine) {
    const c = cloudMap.get(key(l));
    if (c ? l.ts > c.ts : l.ts > lastSync) toPush.push(l);
  }
  if (toPush.length) await remote.push(toPush);
  return { pulled, pushed: toPush.length, lastSync: now };
}
