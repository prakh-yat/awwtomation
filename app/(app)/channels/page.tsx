import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plug } from "lucide-react";

import { ChannelCard } from "@/components/channels/channel-card";
import { ChannelsToasts } from "@/components/channels/channels-toasts";
import { ConnectButtons } from "@/components/channels/connect-buttons";
import { OnboardingBanner } from "@/components/channels/onboarding-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { effectivePlan } from "@/lib/billing/entitlements";
import { limitsFor } from "@/lib/billing/plans";
import { checkLimit } from "@/lib/billing/usage";
import { isMetaConfigured } from "@/lib/env";
import { listChannels, toChannelView } from "@/lib/services/channels";
import { requireWorkspaceContext } from "@/lib/workspace/context";
import { canManageChannels } from "@/lib/workspace/permissions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Channels" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ChannelsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireWorkspaceContext();
  const params = await searchParams;

  const [summaries, slots] = await Promise.all([listChannels(ctx.workspace.id), checkLimit(ctx.workspace.id, "channels")]);
  const channels = summaries.map(toChannelView);
  const configured = isMetaConfigured();
  const canManage = canManageChannels(ctx.role);
  const plan = limitsFor(effectivePlan(ctx.organization));
  // The onboarding banner is only useful while there is nothing connected yet.
  const showOnboarding = params.onboarding === "1" && channels.length === 0;

  return (
    <div>
      <PageHeader
        title="Channels"
        description="The Instagram accounts and Facebook Pages this workspace replies from."
        actions={canManage && channels.length > 0 ? <ConnectButtons configured={configured} /> : null}
      />

      <Suspense fallback={null}>
        <ChannelsToasts channels={channels} />
      </Suspense>

      {showOnboarding ? <OnboardingBanner configured={configured} /> : null}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-[13px] text-muted-foreground">
        <p>
          <span className="font-medium text-foreground tabular-nums">{slots.used}</span> of{" "}
          <span className="tabular-nums">{slots.limit}</span> account{slots.limit === 1 ? "" : "s"} used on the {plan.label} plan
          {!canManage ? ". Ask a workspace admin to connect or disconnect accounts." : ""}
        </p>
        {!slots.ok && canManage ? (
          <Link href="/settings/billing" className="font-medium text-foreground underline underline-offset-4 hover:no-underline">
            Upgrade for more
          </Link>
        ) : null}
      </div>

      {channels.length === 0 ? (
        showOnboarding ? null : (
          <EmptyState
            icon={Plug}
            title="No accounts connected"
            description={
              canManage
                ? "Connect an Instagram professional account or a Facebook Page. Automations reply from the accounts you connect here."
                : "A workspace admin needs to connect an Instagram account or Facebook Page before automations can run."
            }
            action={canManage ? <ConnectButtons configured={configured} className="flex flex-wrap items-center justify-center gap-2" /> : null}
          />
        )
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {channels.map((channel) => (
            <ChannelCard key={channel.id} channel={channel} canManage={canManage} canPurge={ctx.role === "OWNER"} />
          ))}
        </div>
      )}
    </div>
  );
}
