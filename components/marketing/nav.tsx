"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";

import { Container } from "./section";

const links = [
  { label: "Pricing", href: "/pricing" },
];

/**
 * Sits over the top of every page, so a page's first colour block runs behind
 * it (the layout pulls <main> up by the bar's height). Clear at the top of the
 * page, frosted once it scrolls. Below md the links move into a menu.
 */
function MarketingNav() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Moving to another page closes the menu.
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const frosted = scrolled || open;

  return (
    <>
      {/*
       * Tapping the page behind the open menu closes it; Escape and the button do
       * the same from the keyboard. A sibling of the header, because the header's
       * backdrop blur would otherwise pin a fixed element inside its own box.
       */}
      {open ? <div aria-hidden className="fixed inset-0 z-30 bg-ink/20 md:hidden" onClick={() => setOpen(false)} /> : null}

      <header
        className={cn(
          "sticky top-0 z-40 border-b transition-[background-color,border-color] duration-300 ease-soft",
          frosted ? "border-ink/10 bg-background/80 backdrop-blur-xl backdrop-saturate-150" : "border-transparent",
        )}
      >
        <Container className="flex h-16 items-center gap-6">
          <Link
            href="/"
            aria-label={`${brand.name} home`}
            className="-mx-1 flex items-center rounded-lg p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Logo size={26} />
          </Link>

          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={pathname === l.href ? "page" : undefined}
                className="brand-label rounded-full px-3 py-2 text-[12px] text-ink outline-none transition-colors hover:bg-ink/[0.07] focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:bg-ink aria-[current=page]:text-white"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="hidden hover:bg-ink/[0.07] sm:inline-flex">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/login">Start free</Link>
            </Button>
            <button
              type="button"
              aria-expanded={open}
              aria-controls="marketing-menu"
              aria-label={open ? "Close menu" : "Open menu"}
              onClick={() => setOpen((value) => !value)}
              className="-mr-2 flex size-10 items-center justify-center rounded-full text-ink outline-none transition-colors hover:bg-ink/[0.07] focus-visible:ring-2 focus-visible:ring-ring md:hidden"
            >
              <span aria-hidden className="relative block h-3 w-5">
                <span
                  className={cn(
                    "absolute left-0 h-[1.5px] w-5 bg-current transition-transform duration-300 ease-soft",
                    open ? "top-[5px] rotate-45" : "top-0",
                  )}
                />
                <span
                  className={cn(
                    "absolute left-0 h-[1.5px] w-5 bg-current transition-transform duration-300 ease-soft",
                    open ? "top-[5px] -rotate-45" : "top-[10px]",
                  )}
                />
              </span>
            </button>
          </div>
        </Container>

        {open ? (
          <div
            id="marketing-menu"
            className="absolute inset-x-0 top-full animate-fade-in border-b bg-background motion-reduce:animate-none md:hidden"
          >
            <Container className="pb-6 pt-1">
              <ul>
                {[...links, { label: "Sign in", href: "/login" }].map((l) => (
                  <li key={l.href} className="border-b">
                    <Link
                      href={l.href}
                      onClick={() => setOpen(false)}
                      aria-current={pathname === l.href ? "page" : undefined}
                      className="brand-label flex h-14 items-center text-[13px] text-ink outline-none focus-visible:underline aria-[current=page]:underline aria-[current=page]:underline-offset-4"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <Button asChild size="lg" className="mt-6 w-full">
                <Link href="/login" onClick={() => setOpen(false)}>
                  Start free
                </Link>
              </Button>
            </Container>
          </div>
        ) : null}
      </header>
    </>
  );
}

export { MarketingNav };
