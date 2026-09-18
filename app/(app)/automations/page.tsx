import type { Metadata } from "next";
import { AutomationStatus } from "@prisma/client";

import { AutomationsTable } from "@/components/automations/automations-table";
import { NewAutomationButton } from "@/components/automations/new-automation-button";
import { TemplatesButton, TemplatesProvider } from "@/components/automations/templates-launcher";
import { PageHeader } from "@/components/ui/page-header";
import { countAutomations, countAutomationsByStatus, listAutomations, listChannelOptions } from "@/lib/services/automations";
import { listTemplateSummaries } from "@/lib/services/templates";
import { requireWorkspaceContext } from "@/lib/workspace/context";

export const metadata: Metadata = { title: "Automations" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function isStatus(value: string): value is AutomationStatus {
  return value in AutomationStatus;
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

  return (
    // The picker is mounted once here so the header button, the Templates tab
    // (/automations?templates=1) and the empty state all drive the same dialog.
    <TemplatesProvider templates={listTemplateSummaries()} channels={activeChannels} autoOpen={first(params.templates) === "1"}
      autoTemplateId={first(params.template) || undefined}
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
