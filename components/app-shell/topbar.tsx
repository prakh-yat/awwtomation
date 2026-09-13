"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";

import { LogoMark, Wordmark } from "@/components/ui/logo";
import { cn } from "@/lib/utils";

import { Sidebar } from "./sidebar";
import type { ShellProps } from "./types";

/**
 * Mobile header. Below md the rail is hidden, so the same sidebar opens in a
 * left drawer — navigation is identical at every width.
 */
export function Topbar(props: ShellProps) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();
  const active = props.workspaces.find((w) => w.id === props.activeWorkspaceId);

  // Close the drawer on any route change, back/forward included.
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/85 md:hidden">
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Trigger asChild>
          <button
            type="button"
            aria-label="Open menu"
            className="flex h-9 w-9 items-center justify-center rounded-md outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Menu className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </DialogPrimitive.Trigger>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            className={cn(
              "fixed inset-y-0 left-0 z-50 flex h-full w-72 max-w-[85vw] flex-col bg-sidebar shadow-elevated outline-none",
              "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left data-[state=open]:duration-200 data-[state=closed]:duration-150",
            )}
          >
            <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">Navigate between sections</DialogPrimitive.Description>
            <DialogPrimitive.Close
              aria-label="Close menu"
              className="absolute right-3 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
            <Sidebar {...props} collapsed={false} variant="drawer" onNavigate={() => setOpen(false)} />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <Link href="/dashboard" className="flex items-center gap-0.5" aria-label="Dashboard">
        <LogoMark size={24} />
        <Wordmark height={11} />
      </Link>

      {active ? (
        <span className="ml-auto flex max-w-[45%] items-center gap-2 rounded-md border px-2 py-1 text-xs">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary text-[10px] font-semibold text-primary-foreground">
            {active.name.trim().charAt(0).toUpperCase()}
          </span>
          <span className="truncate font-medium">{active.name}</span>
        </span>
      ) : null}
    </header>
  );
}
