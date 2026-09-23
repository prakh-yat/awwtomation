import { MarketingFooter } from "@/components/marketing/footer";
import { MarketingNav } from "@/components/marketing/nav";

export default function MarketingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // `overflow-x-clip` (not hidden) so wide product pictures can never cause sideways scrolling
    // without turning this wrapper into a scroll container, which would break the sticky nav.
    <div className="flex min-h-screen flex-col overflow-x-clip">
      <MarketingNav />
      {/*
       * Pulled up by the nav's height (h-16) so each page's first colour block runs behind the
       * clear nav, as on the site. Every page's first section leaves at least that much room on top.
       */}
      <main className="-mt-16 flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
