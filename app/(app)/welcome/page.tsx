import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { connectHref } from "@/components/channels/channel-status";
import { isBillingConfigured } from "@/lib/billing/dodo/config";
import { isMetaConfigured } from "@/lib/env";
import { getBillingOverview } from "@/lib/services/billing";
import { listChannelOptions } from "@/lib/services/automations";
import { getOnboardingState } from "@/lib/services/onboarding";
import { requireWorkspaceContext } from "@/lib/workspace/context";

import { WelcomeFlow } from "./welcome-flow";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Welcome" };

/**
 * The welcome questionnaire. Runs once per workspace, and only until it is
 * finished or skipped; after that this route just sends you to the dashboard.
 */
export default async function WelcomePage() {
  const ctx = await requireWorkspaceContext();
  const state = await getOnboardingState(ctx.workspace.id);
  if (state.completedAt) redirect("/dashboard");

  const channels = await listChannelOptions(ctx.workspace.id);
  const connected = channels.find((c) => c.status === "ACTIVE") ?? channels[0] ?? null;
  const connectedLabel = connected ? (connected.username ? `@${connected.username}` : (connected.name ?? null)) : null;

  // The plan is an organization-level commitment, so only its owner is asked,
  // and only while there is nothing to change: someone who already subscribed
  // manages the plan from Settings.
  const billing = await getBillingOverview(ctx.organization.id);
  const showPlanStep = ctx.role === "OWNER" && !billing.hasSubscription;

  return (
    <WelcomeFlow
      initialAnswers={state.answers}
      hasChannel={state.hasChannel}
      connectedLabel={connectedLabel}
      configured={isMetaConfigured()}
      connectHrefs={{ instagram: connectHref("INSTAGRAM"), facebook: connectHref("FACEBOOK") }}
      showPlanStep={showPlanStep}
      billingConfigured={isBillingConfigured()}
    />
  );
}
