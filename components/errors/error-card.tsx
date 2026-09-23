"use client";

import Link from "next/link";
import { RotateCw } from "lucide-react";

import { GridBlock } from "@/components/layout/grid-block";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";

export interface ErrorCardProps {
  /** Next's `error.digest`: the only thing about the failure a customer ever sees. */
  reference?: string;
  onRetry: () => void;
  /** The whole window, for the root boundary and bare pages; otherwise a block inside the shell. */
  fullScreen?: boolean;
}

/** A support email that already carries the reference, so nobody has to copy it. */
function supportHref(reference?: string): string {
  const subject = reference ? `Error reference ${reference}` : "Something went wrong";
  return `mailto:${brand.supportEmail}?subject=${encodeURIComponent(subject)}`;
}

/**
 * Shared body for the route error boundaries: a lavender block, one line and
 * two ways on. Deliberately never receives the `Error` itself: `error.message`
 * can carry Prisma/Meta/Node text, and a boundary is the one place React would
 * hand it straight to the customer.
 */
export function ErrorCard({ reference, onRetry, fullScreen = false }: ErrorCardProps) {
  const body = (
    <div className="w-full max-w-2xl animate-fade-in motion-reduce:animate-none">
      <h1
        className={cn(
          "font-display text-balance",
          fullScreen ? "text-[clamp(2.75rem,8vw,6rem)]" : "text-[clamp(2.25rem,5vw,3.75rem)]",
          // After the size: tailwind-merge drops a line height that comes before a font size.
          "leading-[0.92]",
        )}
      >
        Something went wrong
      </h1>
      <p className="mt-5 max-w-md text-[15px] leading-relaxed">
        Try again. If it keeps happening,{" "}
        <a href={supportHref(reference)} className="font-semibold underline underline-offset-4">
          email us
        </a>
        {reference ? " and we’ll look it up." : "."}
      </p>
      <div className="mt-8 flex flex-wrap gap-2">
        <Button size="lg" onClick={onRetry}>
          <RotateCw />
          Try again
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      </div>
      {reference ? (
        <p className="mt-10 font-mono text-[12px] opacity-70" aria-label="Error reference">
          Reference {reference}
        </p>
      ) : null}
    </div>
  );

  if (!fullScreen) {
    return (
      <GridBlock tone="lavender" gridSize="48px" className="rounded-3xl px-6 py-12 sm:px-12 sm:py-16">
        {body}
      </GridBlock>
    );
  }

  return (
    <GridBlock tone="lavender" gridSize="clamp(64px, 10vw, 140px)" className="flex min-h-dvh flex-col px-5 py-5 sm:px-10 sm:py-8">
      <Link
        href="/"
        aria-label={`${brand.name} home`}
        className="-mx-1 flex items-center self-start rounded-md px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Logo size={28} />
      </Link>
      <main className="flex flex-1 items-center py-16">{body}</main>
    </GridBlock>
  );
}
