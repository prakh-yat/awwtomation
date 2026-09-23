import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";

/** The "see more" link in a card's header: quiet until hovered, the arrow nudging toward where it goes. */
export function CardLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex shrink-0 items-center gap-1 rounded-full text-[13px] font-semibold text-muted-foreground outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
    >
      {children}
      <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
    </Link>
  );
}
