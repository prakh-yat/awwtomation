import type { Metadata } from "next";
import { AutomationStatus } from "@prisma/client";

import { AutomationsTable } from "@/components/automations/automations-table";
import { NewAutomationButton } from "@/components/automations/new-automation-button";
import { TemplatesButton, TemplatesProvider } from "@/components/automations/templates-launcher";
import { PageHeader } from "@/components/ui/page-header";
import { templateGoalFor } from "@/lib/onboarding/account-questions";
import { countAutomations, countAutomationsByStatus, listAutomations, listChannelOptions } from "@/lib/services/automations";
import { listTemplateSummaries, type TemplatePlatform } from "@/lib/services/templates";
import { requireWorkspaceContext } from "@/lib/workspace/context";

export const metadata: Metadata = { title: "Automations" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function isStatus(value: string): value is AutomationStatus {
  return value in AutomationStatus;
}

function templatePlatform(value: string): TemplatePlatform | undefined {
  return value === "instagram" ? "INSTAGRAM" : value === "messenger" ? "MESSENGER" : undefined;
}

export default async function AutomationsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireWorkspaceContext();
  const params = await searchParams;
  const q = first(params.q).trim();
  const channelId = first(params.channel);
  const statusRaw = first(params.status);
  const status = isStatus(statusRaw) ? statusRaw : undefined;

  const [automations, channels, total, statusCounts] = await Promise.all([
    listAutomations(ctx.workspace.id, { q: q || undefined, channelId: channelId || undefined, status }),
    listChannelOptions(ctx.workspace.id),
    countAutomations(ctx.workspace.id),
    countAutomationsByStatus(ctx.workspace.id, channelId || undefined),
  ]);

  const activeChannels = channels.filter((c) => c.status === "ACTIVE");
  const firstActiveChannelId = activeChannels[0]?.id ?? null;

  // `?goal=&platform=` open the gallery on an account's first goal (the link
  // after its setup questions). A goal the platform has no templates for is
  // dropped, or the gallery would open on an empty list.
  const templates = listTemplateSummaries();
  const autoPlatform = templatePlatform(first(params.platform));
  const goal = templateGoalFor(first(params.goal));
  const autoGoal = goal && templates.some((t) => t.goal === goal && (!autoPlatform || t.platform === autoPlatform)) ? goal : undefined;

  return (
    // The picker is mounted once here so the header button, the Templates tab
    // (/automations?templates=1) and the empty state all drive the same dialog.
    <TemplatesProvider
      templates={templates}
      channels={activeChannels}
      autoOpen={first(params.templates) === "1"}
      autoTemplateId={first(params.template) || undefined}
      autoGoal={autoGoal}
      autoPlatform={autoPlatform}
    >
      <PageHeader
        title="Automations"
        actions={
          <>
            <TemplatesButton />
            <NewAutomationButton channelId={firstActiveChannelId} />
          </>
        }
      />
      <AutomationsTable
        automations={automations}
        channels={channels}
        filters={{ q, channelId, status: status ?? "" }}
        statusCounts={statusCounts}
        hasAny={total > 0}
        firstActiveChannelId={firstActiveChannelId}
      />
    </TemplatesProvider>
  );
}
