import * as React from "react";
import { cookies } from "next/headers";

import { TooltipProvider } from "@/components/ui/tooltip";

import { Sidebar } from "./sidebar";
import { isSidebarCollapsed, SIDEBAR_COOKIE } from "./sidebar-collapse";
import { Topbar } from "./topbar";
import type { ShellProps } from "./types";

export interface AppFrameProps extends ShellProps {
  children: React.ReactNode;
}

/**
 * The signed-in layout: sidebar rail on desktop, header + drawer on mobile. The
 * collapsed preference comes from a cookie so the server renders the final
 * width and nothing jumps on load.
 */
export async function AppFrame({ children, ...shell }: AppFrameProps) {
  const cookieStore = await cookies();
  const collapsed = isSidebarCollapsed(cookieStore.get(SIDEBAR_COOKIE)?.value);

  return (
    <TooltipProvider delayDuration={150} skipDelayDuration={300}>
      <div className="flex min-h-screen w-full bg-background">
        <Sidebar {...shell} collapsed={collapsed} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar {...shell} />
          <main id="main" className="flex-1">
            {children}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
