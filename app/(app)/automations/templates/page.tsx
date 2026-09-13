import type { Metadata } from "next";
import Link from "next/link";
import { Plug } from "lucide-react";

import { TemplateGallery } from "@/components/automations/template-gallery";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { listChannelOptions } from "@/lib/services/automations";
import { listTemplateSummaries } from "@/lib/services/templates";
import { requireWorkspaceContext } from "@/lib/workspace/context";

export const metadata: Metadata = { title: "Templates" };

export default async function AutomationTemplatesPage() {
  const ctx = await requireWorkspaceContext();
  const channels = (await listChannelOptions(ctx.workspace.id)).filter((c) => c.status === "ACTIVE");

  return (
    <>
      <PageHeader
        title="Templates"
        description="Start from a flow that already works, then change anything you like."
        backHref="/automations"
        backLabel="Automations"
      />
      {channels.length === 0 ? (
        <EmptyState
          icon={Plug}
          title="Connect an account first"
          description="Automations listen on a connected Instagram or Facebook account. Connect one, then come back here."
          action={
            <Button asChild>
              <Link href="/channels">
                <Plug /> Go to Channels
              </Link>
            </Button>
          }
        />
      ) : (
        <TemplateGallery templates={listTemplateSummaries()} channels={channels} />
      )}
    </>
  );
}
