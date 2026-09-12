import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Full-height shell for the three-pane inbox.
 *
 * `app/(app)/layout.tsx` wraps pages in `px-6 py-6 lg:px-8`; the negative
 * margins cancel exactly that so the panes touch the sidebar and the viewport
 * edges. Height is the viewport minus the 3.5rem mobile topbar (`md:hidden`
 * in the shell) — on desktop the sidebar is sticky and <main> is not a scroll
 * container, so a 100dvh box with `overflow-hidden` leaves the document at
 * exactly one viewport tall: the panes scroll internally, nothing else does.
 */
function InboxFrame({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "-mx-6 -my-6 flex h-[calc(100dvh-3.5rem)] min-h-0 overflow-hidden bg-background md:h-dvh lg:-mx-8",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export { InboxFrame };
