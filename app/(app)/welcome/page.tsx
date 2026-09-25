import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { isBillingConfigured } from "@/lib/billing/dodo/config";
import { isLivePlan } from "@/lib/billing/plans";
import { getBillingOverview } from "@/lib/services/billing";
import { getOnboardingState } from "@/lib/services/onboarding";
import { requireWorkspaceContext } from "@/lib/workspace/context";

import { WelcomeFlow } from "./welcome-flow";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Welcome" };

/**
 * The welcome flow. Runs once per workspace, and only until it is finished or
 * skipped; after that this route just sends you to the dashboard.
 */
export default async function WelcomePage() {
  const ctx = await requireWorkspaceContext();
  const state = await getOnboardingState(ctx.workspace.id);
  if (state.completedAt) redirect("/dashboard");

  // The plan is an organization-level commitment, so only its owner is asked,
  // and only while there is nothing to change: an organization that already
  // subscribed, or was given a plan, manages it from Settings.
  const billing = ctx.role === "OWNER" ? await getBillingOverview(ctx.organization.id) : null;
  const showPlanStep = billing !== null && !billing.hasSubscription && !isLivePlan(billing.effectivePlan);

  return <WelcomeFlow initialAnswers={state.answers} showPlanStep={showPlanStep} billingConfigured={isBillingConfigured()} />;
}
