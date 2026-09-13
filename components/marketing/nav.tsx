import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

import { Container } from "./section";

const links = [
  { label: "How it works", href: "/#how-it-works" },
  { label: "Pricing", href: "/pricing" },
  { label: "FAQ", href: "/#faq" },
];

function MarketingNav() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <Container className="flex h-14 items-center gap-8">
        <Link
          href="/"
          className="-mx-1 flex items-center rounded-md px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Awwtomation home"
        >
          <Logo size={24} />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-6 sm:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-sm text-[14px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="text-[14px]">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm" className="text-[14px]">
            <Link href="/login">Start free</Link>
          </Button>
        </div>
      </Container>
    </header>
  );
}

export { MarketingNav };
