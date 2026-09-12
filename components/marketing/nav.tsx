import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

const links = [
  { label: "How it works", href: "/#how-it-works" },
  { label: "Pricing", href: "/pricing" },
  { label: "FAQ", href: "/#faq" },
];

function MarketingNav() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-6">
        <Link href="/" className="flex items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Home">
          <Logo size={26} />
        </Link>
        <nav aria-label="Marketing" className="hidden items-center gap-1 sm:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/login">Get started</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

export { MarketingNav };
