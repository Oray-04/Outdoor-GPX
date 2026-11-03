"use client";
import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export interface Pos { lng: number; lat: number }
interface Ctx { pos: Pos | null; status: "idle" | "loading" | "ok" | "error"; request: (onOk?: (p: Pos) => void, onErr?: (m: string) => void) => void }
const GeoCtx = createContext<Ctx | null>(null);

/** Géolocalisation à la demande : déclenchée uniquement par une action explicite de l'utilisateur. */
export function GeoProvider({ children }: { children: ReactNode }) {
  const [pos, setPos] = useState<Pos | null>(null);
  const [status, setStatus] = useState<Ctx["status"]>("idle");

  const request = useCallback<Ctx["request"]>((onOk, onErr) => {
    if (!("geolocation" in navigator)) { setStatus("error"); onErr?.("La géolocalisation n'est pas disponible sur cet appareil."); return; }
    setStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (g) => { const p = { lng: g.coords.longitude, lat: g.coords.latitude }; setPos(p); setStatus("ok"); onOk?.(p); },
      (e) => { setStatus("error"); onErr?.(e.code === e.PERMISSION_DENIED ? "Autorisation refusée : activez la localisation dans votre navigateur." : "Position introuvable."); },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }, []);

  return <GeoCtx.Provider value={{ pos, status, request }}>{children}</GeoCtx.Provider>;
}

export function useGeo() {
  const c = useContext(GeoCtx);
  if (!c) throw new Error("useGeo doit être utilisé dans <GeoProvider>");
  return c;
}
