import Link from "next/link";

import { Logo } from "@/components/ui/logo";
import { brand } from "@/lib/brand";

import { Container } from "./section";

const columns = [
  {
    heading: "Product",
    links: [
      { label: "Pricing", href: "/pricing" },
      { label: "Sign in", href: "/login" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy", href: brand.legal.privacy },
      { label: "Terms", href: brand.legal.terms },
      { label: "Data deletion", href: brand.legal.dataDeletion },
    ],
  },
];

const linkClass =
  "rounded-sm text-[15px] text-white/85 underline-offset-4 outline-none transition-colors hover:text-white hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-ink";

/** Ink footer, as on the site: the white logo, link columns and the Meta disclaimer. */
function MarketingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-white/10 bg-ink text-white">
      <Container className="pb-10 pt-16 sm:pt-20">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-20">
          <div className="max-w-sm">
            <Link
              href="/"
              aria-label={`${brand.name} home`}
              className="inline-flex rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-ink"
            >
              <Logo size={32} className="[&_svg]:text-white" />
            </Link>
            <p className="mt-5 text-[15px] leading-6 text-white/65">{brand.tagline}</p>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-10 gap-y-10 sm:grid-cols-3 sm:gap-x-16">
            {columns.map((column) => (
              <div key={column.heading}>
                <p className="brand-label text-white/55">{column.heading}</p>
                <ul className="mt-4 space-y-3">
                  {column.links.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} className={linkClass}>
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="col-span-2 sm:col-span-1">
              <p className="brand-label text-white/55">Questions</p>
              <a href={`mailto:${brand.supportEmail}`} className={`${linkClass} mt-4 inline-block`}>
                {brand.supportEmail}
              </a>
            </div>
          </nav>
        </div>

        <div className="mt-16 flex flex-col gap-3 border-t border-white/15 pt-6 text-[12px] leading-5 text-white/55 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
          <p className="brand-label shrink-0">
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
