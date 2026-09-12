"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * Whole-row click target. Keep a real <Link> inside one cell too so keyboard
 * users and middle-click still work; the double navigation is harmless.
 */
export function LinkRow({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <TableRow
      onClick={(e) => {
        // Let native links/buttons inside the row handle their own clicks.
        if ((e.target as HTMLElement).closest("a,button")) return;
        router.push(href);
      }}
      className={cn("cursor-pointer", className)}
    >
      {children}
    </TableRow>
  );
}
