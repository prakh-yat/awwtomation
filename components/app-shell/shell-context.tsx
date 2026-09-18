"use client";

import * as React from "react";
import type { WorkspaceRole } from "@prisma/client";

/**
 * The few pieces of shell state a page-level component needs.
 *
 * Today that is the viewer's role, which decides whether the Team and Billing
 * tabs appear next to a page title. Pages outside the signed-in shell (the
 * marketing site, /login) render without a provider and simply get no tabs.
 */
export type ShellContextValue = { role: WorkspaceRole };

const ShellContext = React.createContext<ShellContextValue | null>(null);

export function ShellProvider({ role, children }: ShellContextValue & { children: React.ReactNode }) {
  const value = React.useMemo(() => ({ role }), [role]);
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellContextValue | null {
  return React.useContext(ShellContext);
}
