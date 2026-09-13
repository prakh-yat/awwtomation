import Link from "next/link";

import { LogoMark, Wordmark } from "@/components/ui/logo";
import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * Full-screen step outside the app shell: invitations, choosing or creating an
 * organization. Logo on top, one card in the middle.
 */
export function CenteredPage({
  children,
  footer,
  logoHref = "/",
  wide = false,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
  logoHref?: string;
  wide?: boolean;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className={cn("w-full animate-fade-in", wide ? "max-w-lg" : "max-w-md")}>
        <div className="mb-6 text-center">
          <Link href={logoHref} aria-label={brand.name} className="inline-flex items-center gap-0.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <LogoMark size={26} />
            <Wordmark height={12} />
          </Link>
        </div>
        <div className="rounded-lg border bg-card p-8 shadow-card">{children}</div>
        {footer ? <div className="mt-6 text-center text-xs text-muted-foreground">{footer}</div> : null}
      </div>
    </main>
  );
}
