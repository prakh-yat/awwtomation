import { MarketingFooter } from "@/components/marketing/footer";
import { MarketingNav } from "@/components/marketing/nav";

export default function MarketingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // `overflow-x-clip` (not hidden) so wide product pictures can never cause sideways scrolling
    // without turning this wrapper into a scroll container, which would break the sticky nav.
    <div className="flex min-h-screen flex-col overflow-x-clip">
      <MarketingNav />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
