"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { isFullBleedPath } from "@/lib/workspace/request";

/**
 * Padding around every app page. Decided on the client: the layout that
 * renders this persists across navigations, so a pathname read on the server
 * would still describe the page the user started on.
 */
export function PageFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const fullBleed = isFullBleedPath(pathname);
  return <div className={cn("min-w-0", fullBleed ? "h-full" : "w-full animate-fade-in px-5 py-6 md:px-8 md:py-7")}>{children}</div>;
}
