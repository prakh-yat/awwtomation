import * as React from "react";

import { TooltipProvider } from "@/components/ui/tooltip";

import { Dock } from "./dock";
import { ProductTour } from "./product-tour";
import { ShellProvider } from "./shell-context";
import { Topbar } from "./topbar";
import type { ShellProps } from "./types";

export interface AppFrameProps extends ShellProps {
  children: React.ReactNode;
  /** This person has been shown the product tour (`User.tourCompletedAt`); until then it opens by itself. */
  hasSeenTour: boolean;
}

/**
 * The signed-in layout.
 *
 * On desktop navigation lives in the dock, which floats over the page and stays
 * hidden until the pointer reaches the left edge, so every page gets the full
 * width of the window. Below md the dock is replaced by the header and its
 * drawer, which is the same navigation in a form that works without a pointer.
 */
export function AppFrame({ children, hasSeenTour, ...shell }: AppFrameProps) {
  return (
    <TooltipProvider delayDuration={150} skipDelayDuration={300}>
      <ShellProvider role={shell.role}>
        <div className="flex min-h-screen w-full flex-col bg-background">
          <Dock {...shell} />
          <Topbar {...shell} />
          {/* Beside the dock, not inside the page: the page frame animates a
              transform, and a transformed ancestor would pin the tour's fixed
              overlay to the page instead of the window. */}
          <ProductTour userId={shell.user.id} hasSeenTour={hasSeenTour} role={shell.role} />
          <main id="main" className="min-w-0 flex-1">
            {children}
          </main>
        </div>
      </ShellProvider>
    </TooltipProvider>
  );
}
