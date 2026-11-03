"use client";
import { useMemo } from "react";
import { routesRepo } from "./repo";
import { useStore } from "./store";
import { DEMO_VMS, fromSaved, type RouteVM } from "./route-model";

export function useAllRoutes(): RouteVM[] {
  const mine = routesRepo.useAll();
  return useMemo(() => [...mine.map(fromSaved), ...DEMO_VMS], [mine]);
}
export const useVerified = () => useStore<string[]>("verified", []);
