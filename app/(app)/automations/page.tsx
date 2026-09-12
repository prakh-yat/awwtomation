import type { Metadata } from "next";
import Link from "next/link";
import { AutomationStatus } from "@prisma/client";
import { Plus } from "lucide-react";

import { AutomationsTable } from "@/components/automations/automations-table";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { brand } from "@/lib/brand";
import { countAutomations, listAutomations, listChannelOptions } from "@/lib/services/automations";
import { listTemplateSummaries } from "@/lib/services/templates";
import { requireWorkspaceContext } from "@/lib/workspace/context";

export const metadata: Metadata = { title: `Automations · ${brand.name}` };

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

  const [automations, channels, total] = await Promise.all([
    listAutomations(ctx.workspace.id, { q: q || undefined, channelId: channelId || undefined, status }),
    listChannelOptions(ctx.workspace.id),
    countAutomations(ctx.workspace.id),
  ]);

  return (
    <>
      <PageHeader
        title="Automations"
        description="Turn comments, DMs and story replies into instant conversations."
        actions={
          <Button asChild>
            <Link href="/automations/new">
              <Plus /> New automation
            </Link>
          </Button>
        }
      />
      <AutomationsTable
        automations={automations}
        channels={channels}
        templates={listTemplateSummaries()}
        filters={{ q, channelId, status: status ?? "" }}
        hasAny={total > 0}
      />
    </>
  );
}
