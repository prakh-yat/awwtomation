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
 * Server component that lays out the protected app: sticky sidebar on
 * desktop, topbar + drawer on mobile, and a <main> for the page. The initial
 * collapsed state comes from the cookie so SSR paints the right width.
 */
async function AppFrame({ children, ...shell }: AppFrameProps) {
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

export { AppFrame };
