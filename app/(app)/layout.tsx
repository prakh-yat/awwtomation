import type { Metadata } from "next";

import { AppFrame } from "@/components/app-shell/app-frame";
import { PageFrame } from "@/components/app-shell/page-frame";
import { effectivePlan } from "@/lib/billing/entitlements";
import { limitsFor } from "@/lib/billing/plans";
import { currentPeriodStart, nextPeriodStart } from "@/lib/billing/usage";
import { getRequestPathname, ONBOARDING_PATH, requireWorkspaceContext } from "@/lib/workspace/context";

export const metadata: Metadata = {
  // The product itself is never indexed; only the marketing pages are public.
  robots: { index: false, follow: false },
};

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // /onboarding lives under (app) but must render for users with no workspace
  // yet — the guard below would redirect it to itself. Middleware already
  // guarantees a signed-in user, and the page is a full-screen step, so it
  // renders without the sidebar.
  const pathname = await getRequestPathname();
  if (pathname === ONBOARDING_PATH) {
    return <>{children}</>;
  }

  const ctx = await requireWorkspaceContext();
  const { organization, workspace } = ctx;
  const plan = effectivePlan(organization);

  // The sidebar meter reads straight off the organization row we already have —
  // no extra query per page. A count from a previous month hasn't been reset
  // yet (that happens on the next send), so it reads as zero.
  const stale = organization.usagePeriodStart < currentPeriodStart();
  const usage = {
    used: stale ? 0 : organization.dmsSentThisPeriod,
    limit: limitsFor(plan).dmsPerMonth,
    resetsAt: nextPeriodStart().toISOString(),
  };

  return (
    <AppFrame
      user={{ name: ctx.user.name, email: ctx.user.email, avatarUrl: ctx.user.avatarUrl }}
      organization={{ id: organization.id, name: organization.name, plan }}
      organizationCount={ctx.organizations.length}
      workspaces={ctx.workspaces.map((w) => ({ id: w.id, name: w.name }))}
      activeWorkspaceId={workspace.id}
      role={ctx.role}
      usage={usage}
    >
      {/* Pages use the full width next to the sidebar; the builder and inbox also drop the padding and draw edge to edge. */}
      <PageFrame>{children}</PageFrame>
    </AppFrame>
  );
}
