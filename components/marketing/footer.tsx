import Link from "next/link";

import { Logo } from "@/components/ui/logo";
import { brand } from "@/lib/brand";

import { Container } from "./section";

const links = [
  { label: "How it works", href: "/#how-it-works" },
  { label: "Pricing", href: "/pricing" },
  { label: "Sign in", href: "/login" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "Data deletion", href: "/data-deletion" },
];

function MarketingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t">
      <Container className="py-12">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-sm">
            <Link href="/" aria-label="Awwtomation home" className="inline-flex rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Logo size={22} />
            </Link>
            <p className="mt-3 text-[13px] leading-6 text-muted-foreground">{brand.tagline}</p>
          </div>
          <nav aria-label="Footer" className="lg:text-right">
            <ul className="flex flex-wrap gap-x-6 gap-y-2 lg:justify-end">
              {links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-[13px] text-foreground/80 transition-colors hover:text-foreground">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[13px] text-muted-foreground">
              Questions:{" "}
              <a href={`mailto:${brand.supportEmail}`} className="text-foreground/80 underline-offset-4 hover:text-foreground hover:underline">
                {brand.supportEmail}
              </a>
            </p>
          </nav>
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t pt-6 text-[12px] leading-5 text-muted-foreground lg:flex-row lg:justify-between lg:gap-8">
          <p className="shrink-0">
            © {year} {brand.company}
          </p>
          <p className="lg:text-right">
            {brand.name} is not affiliated with Meta Platforms, Inc. Instagram and Facebook are trademarks of Meta.
          </p>
        </div>
      </Container>
    </footer>
  );
}

export { MarketingFooter };
