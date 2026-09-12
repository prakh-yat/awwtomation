"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";

import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";

import { Sidebar } from "./sidebar";
import type { ShellProps } from "./types";
import { UserMenu } from "./user-menu";

export type TopbarProps = ShellProps;

/**
 * Mobile-only header. The full sidebar is reused inside a left-anchored
 * Dialog so navigation stays identical across breakpoints.
 */
function Topbar(props: TopbarProps) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  // Close the drawer whenever the route changes (back/forward included).
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Trigger asChild>
          <button
            type="button"
            aria-label="Open navigation"
            className="flex h-9 w-9 items-center justify-center rounded-md text-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Menu size={18} strokeWidth={1.75} />
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
            <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">Main application navigation</DialogPrimitive.Description>
            <DialogPrimitive.Close
              aria-label="Close navigation"
              className="absolute right-2 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X size={16} />
            </DialogPrimitive.Close>
            <Sidebar {...props} collapsed={false} variant="drawer" onNavigate={() => setOpen(false)} />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <Link href="/dashboard" className="flex items-center" aria-label="Dashboard">
        <Logo size={24} />
      </Link>
      <span className="flex-1" />
      <UserMenu user={props.user} isSuperAdmin={props.isSuperAdmin} collapsed side="bottom" className="w-auto px-1" />
    </header>
  );
}

export { Topbar };
