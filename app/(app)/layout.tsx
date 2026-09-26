import type { Metadata } from "next";

export const metadata: Metadata = {
  // The product itself is never indexed; only /pricing is public.
  robots: { index: false, follow: false },
};

/**
 * Everything signed in. The product's pages are in `(shell)`, which draws the
 * dock around them; /onboarding and /welcome take the whole window on their
 * own. Middleware already guarantees a signed-in user on all of them.
 */
export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
