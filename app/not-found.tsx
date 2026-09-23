import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { GridBlock } from "@/components/layout/grid-block";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { brand } from "@/lib/brand";

export default function NotFound() {
  return (
    <GridBlock tone="yellow" gridSize="clamp(64px, 10vw, 140px)" className="flex min-h-dvh flex-col px-5 py-5 sm:px-10 sm:py-8">
      <Link
        href="/"
        aria-label={`${brand.name} home`}
        className="-mx-1 flex items-center self-start rounded-md px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Logo size={28} />
      </Link>

      <main className="flex flex-1 flex-col justify-center py-16">
        <div className="animate-fade-in motion-reduce:animate-none">
          <p aria-hidden className="font-display text-[clamp(7rem,24vw,17rem)] leading-[0.8] tracking-[-0.05em]">
            404
          </p>
          <h1 className="mt-8 font-display text-[clamp(1.75rem,4vw,2.75rem)] leading-none">Page not found</h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed">The link may be broken, or the page has moved.</p>
          <div className="mt-8 flex flex-wrap gap-2">
            <Button asChild size="lg">
              <Link href="/dashboard">Go to dashboard</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/">
                <ArrowLeft />
                Home
              </Link>
            </Button>
          </div>
        </div>
      </main>
    </GridBlock>
  );
}
