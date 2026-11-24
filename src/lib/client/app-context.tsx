"use client";

import { type ReactNode, createContext, useContext } from "react";
import { type Engine, useActions, useComputeEngine } from "./store";

type Actions = ReturnType<typeof useActions>;

const EngineContext = createContext<Engine | null>(null);
const ActionsContext = createContext<Actions | null>(null);

/** Computes derived data once and shares it (and the mutations) with every screen. */
export function AppDataProvider({ children }: { children: ReactNode }) {
  const engine = useComputeEngine();
  const actions = useActions();
  return (
    <ActionsContext.Provider value={actions}>
      <EngineContext.Provider value={engine}>{children}</EngineContext.Provider>
    </ActionsContext.Provider>
  );
}

export function useEngine(): Engine {
  const ctx = useContext(EngineContext);
  if (!ctx) throw new Error("useEngine must be used inside AppDataProvider");
  return ctx;
}

export function useAppActions(): Actions {
  const ctx = useContext(ActionsContext);
  if (!ctx) throw new Error("useAppActions must be used inside AppDataProvider");
  return ctx;
}
