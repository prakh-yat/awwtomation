import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { isBillingConfigured } from "@/lib/billing/dodo/config";
import { isLivePlan } from "@/lib/billing/plans";
import { getBillingOverview } from "@/lib/services/billing";
import { getOnboardingState } from "@/lib/services/onboarding";
import { sanitizeNextPath } from "@/lib/utils";
import { requireWorkspaceContext } from "@/lib/workspace/context";
import { WELCOME_PATH } from "@/lib/workspace/request";

import { WelcomeFlow } from "./welcome-flow";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Welcome" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * The welcome flow. It asks what has not been asked yet: the questions about
 * the person once per person (everyone, including people who signed up before
 * they existed and invited members, is sent here from the app until they have
 * answered or skipped them), and the workspace's own once per workspace. With
 * nothing left to ask it sends you on: to `?next=` when the app sent you here
 * from another page, else the dashboard.
 */
export default async function WelcomePage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireWorkspaceContext();
  const params = await searchParams;
  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next;
  const next = sanitizeNextPath(rawNext, "/dashboard");
  const returnTo = next.startsWith(WELCOME_PATH) ? "/dashboard" : next;

  const state = await getOnboardingState(ctx.workspace.id, ctx.user.id);
  // The same test the app shell uses to send people here, so the two can never disagree and loop.
  const askProfile = !ctx.user.profileCompletedAt;
  const askWorkspace = state.completedAt === null;
  if (!askProfile && !askWorkspace) redirect(returnTo);

  // The plan is an organization-level commitment, so only its owner is asked,
  // only while setting up a workspace, and only while there is nothing to
  // change: an organization that already subscribed, or was given a plan,
  // manages it from Settings.
  const billing = askWorkspace && ctx.role === "OWNER" ? await getBillingOverview(ctx.organization.id) : null;
  const showPlanStep = billing !== null && !billing.hasSubscription && !isLivePlan(billing.effectivePlan);

  return (
    <WelcomeFlow
      initialAnswers={{ ...state.profile, ...state.answers }}
      askProfile={askProfile}
      askWorkspace={askWorkspace}
      showPlanStep={showPlanStep}
      billingConfigured={isBillingConfigured()}
      returnTo={returnTo}
    />
  );
}
