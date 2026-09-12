import Link from "next/link";

import { Logo } from "@/components/ui/logo";
import { brand } from "@/lib/brand";

const productLinks = [
  { label: "Pricing", href: "/pricing" },
  { label: "Sign in", href: "/login" },
];

const legalLinks = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "Data deletion", href: "/data-deletion" },
];

function MarketingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t">
      <div className="mx-auto w-full max-w-6xl px-6 py-12">
        <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xs">
            <Logo size={24} />
            <p className="mt-3 text-[13px] leading-6 text-muted-foreground">{brand.tagline}</p>
          </div>
          <div className="grid grid-cols-2 gap-10 sm:gap-16">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Product</p>
              <ul className="mt-3 space-y-2">
                {productLinks.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-[13px] text-foreground/80 transition-colors hover:text-foreground">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Legal</p>
              <ul className="mt-3 space-y-2">
                {legalLinks.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-[13px] text-foreground/80 transition-colors hover:text-foreground">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <div className="mt-12 flex flex-col gap-2 border-t pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {brand.company}. All rights reserved.
          </p>
          <p>
            {brand.name} is not affiliated with Meta Platforms, Inc. Instagram and Facebook are trademarks of Meta.
          </p>
        </div>
      </div>
    </footer>
  );
}

export { MarketingFooter };
