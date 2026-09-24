import * as React from "react";
import { CircleAlert } from "lucide-react";

import { GridBlock } from "@/components/layout/grid-block";
import { Logo } from "@/components/ui/logo";

/**
 * The frame for the consent screen an AI app sends people to: the logo on the
 * site's yellow block, then one card. It stands alone, outside the app shell,
 * because the person arrives from another product.
 */
export function AuthorizeShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col bg-fog">
      <GridBlock tone="yellow" gridSize="64px" className="px-5 py-5 sm:px-8">
        <Logo size={26} />
      </GridBlock>
      <div className="flex flex-1 items-start justify-center px-4 py-10 sm:py-16">
        <div className="w-full max-w-[460px] animate-fade-in motion-reduce:animate-none">{children}</div>
      </div>
    </main>
  );
}

/** A request we cannot send back to the app: an unknown client or an unregistered return address. */
export function AuthorizeError({ title, detail }: { title: string; detail: string }) {
  return (
    <AuthorizeShell>
      <div role="alert" className="rounded-2xl border bg-card p-6 sm:p-7">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <CircleAlert className="h-5 w-5" aria-hidden />
        </span>
        <h1 className="mt-4 font-display text-[28px] leading-none">{title}</h1>
        <p className="mt-3 text-[14px] leading-6 text-muted-foreground">{detail}</p>
      </div>
    </AuthorizeShell>
  );
}
