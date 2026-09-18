"use client";

import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { GENERIC_SERVER_ERROR } from "@/lib/errors/customer-messages";

export interface ErrorCardProps {
  /** Next's `error.digest`: the only thing about the failure a customer ever sees. */
  reference?: string;
  onRetry: () => void;
  /** Full-height centring for the root boundary; the app boundary sits inside the shell. */
  fullScreen?: boolean;
}

/**
 * Shared body for the route error boundaries. Deliberately never receives
 * the `Error` itself: `error.message` can carry Prisma/Meta/Node text, and a
 * boundary is the one place React would hand it straight to the customer.
 */
export function ErrorCard({ reference, onRetry, fullScreen = false }: ErrorCardProps) {
  return (
    <div className={fullScreen ? "flex min-h-screen flex-col items-center justify-center px-6 text-center" : "flex flex-col items-center py-24 text-center"}>
      <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-background shadow-card">
        <TriangleAlert className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      </div>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{GENERIC_SERVER_ERROR} If it keeps happening, let us know and quote the reference below.</p>
      {reference ? (
        <p className="mt-3 font-mono text-[11px] text-muted-foreground" aria-label="Error reference">
          Reference: {reference}
        </p>
      ) : null}
      <div className="mt-8 flex gap-2">
        <Button asChild variant="outline">
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
        <Button onClick={onRetry}>Try again</Button>
      </div>
    </div>
  );
}
