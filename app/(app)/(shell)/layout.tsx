import { redirect } from "next/navigation";

import { AppFrame } from "@/components/app-shell/app-frame";
import { PageFrame } from "@/components/app-shell/page-frame";
import { effectivePlan } from "@/lib/billing/entitlements";
import { limitsFor } from "@/lib/billing/plans";
import { currentPeriodStart, nextPeriodStart } from "@/lib/billing/usage";
import { hasSeenCurrentTour } from "@/lib/services/tour";
import { getRequestPathname, requireWorkspaceContext } from "@/lib/workspace/context";
import { WELCOME_PATH } from "@/lib/workspace/request";

/**
 * The app shell: the dock, the phone header and the product tour around every
 * page of the product. /onboarding and /welcome sit beside this group rather
 * than in it, so moving between them and the product swaps the whole layout:
 * a layout both shared would be kept as it was on a client-side navigation,
 * and the dashboard would open without its dock after the welcome flow.
 */
export default async function ShellLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const ctx = await requireWorkspaceContext();

  // Everyone answers the welcome flow's questions about themselves once, people
  // who signed up before they existed and invited members included. They come
  // back to the page they were opening afterwards.
  if (!ctx.user.profileCompletedAt) {
    const pathname = await getRequestPathname();
    const back = pathname && pathname !== "/dashboard" ? `?next=${encodeURIComponent(pathname)}` : "";
    redirect(`${WELCOME_PATH}${back}`);
  }

  const { organization, workspace } = ctx;
  const plan = effectivePlan(organization);

  // The sidebar meter reads straight off the organization row we already have:
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
      user={{ id: ctx.user.id, name: ctx.user.name, email: ctx.user.email, avatarUrl: ctx.user.avatarUrl }}
      // Per person, not per browser: the tour opens once whichever device they sign in on.
      hasSeenTour={hasSeenCurrentTour(ctx.user)}
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
