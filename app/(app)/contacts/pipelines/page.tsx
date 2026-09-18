import type { Metadata } from "next";

import { PipelinesManager } from "@/components/pipelines/pipelines-manager";
import { PageHeader } from "@/components/ui/page-header";
import { listPipelines } from "@/lib/services/pipelines";
import { requireWorkspaceContext } from "@/lib/workspace/context";
import { canManageSettings } from "@/lib/workspace/permissions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Pipelines" };

export default async function PipelinesPage() {
  const ctx = await requireWorkspaceContext();
  const pipelines = await listPipelines(ctx.workspace.id);
  const canManage = canManageSettings(ctx.role);

  return (
    <>
      <PageHeader
        backHref="/contacts"
        backLabel="Contacts"
        title="Contacts"
      />
      <PipelinesManager initialPipelines={pipelines} canManage={canManage} />
    </>
  );
}
