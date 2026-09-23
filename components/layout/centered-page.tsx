import Link from "next/link";

import { GridLines, isDarkTone } from "@/components/layout/grid-block";
import { LogoMark, Wordmark } from "@/components/ui/logo";
import { TONES, type Tone } from "@/components/ui/tone";
import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * Full-screen step outside the app shell: invitations, choosing or creating an
 * organization. The logo in the corner and one card in the middle, on fog with
 * the site's faint grid, or on a brand block when `tone` is set.
 */
export function CenteredPage({
  children,
  footer,
  banner,
  logoHref = "/",
  wide = false,
  tone,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** A colour band across the top of the card, flush with its edges. */
  banner?: React.ReactNode;
  logoHref?: string;
  wide?: boolean;
  /** Paints the page as a brand block; fog when unset. */
  tone?: Tone;
}) {
  const logoInk = tone && isDarkTone(tone) ? "text-white" : "text-ink";

  return (
    <main className={cn("relative isolate flex min-h-dvh flex-col", tone ? TONES[tone].solid : "bg-fog")}>
      {tone ? (
        <GridLines tone={tone} size="clamp(56px, 8vw, 112px)" />
      ) : (
        <GridLines tone="fog" className="[mask-image:radial-gradient(ellipse_at_top,black_15%,transparent_70%)]" />
      )}

      <header className="relative flex h-16 shrink-0 items-center px-5 sm:px-8">
        <Link
          href={logoHref}
          aria-label={brand.name}
          className="-mx-1 flex items-center gap-0.5 rounded-md px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <LogoMark size={26} className={logoInk} />
          <Wordmark height={12} className={logoInk} />
        </Link>
      </header>

      <div className="relative flex flex-1 items-start justify-center px-4 pb-16 pt-4 sm:items-center sm:pt-0">
        <div className={cn("w-full animate-fade-in motion-reduce:animate-none", wide ? "max-w-lg" : "max-w-md")}>
          <div className={cn("overflow-hidden rounded-3xl bg-card text-card-foreground", tone ? null : "border")}>
            {banner}
            <div className="p-6 sm:p-8">{children}</div>
          </div>
          {footer ? (
            <div className={cn("mt-6 text-center text-[13px]", tone ? "opacity-80" : "text-muted-foreground")}>{footer}</div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
