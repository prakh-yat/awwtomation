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
        title="Pipelines"
        description={
          canManage
            ? "The stages contacts move through. Keep one for sales, another for wholesale, and give each stage a colour."
            : "The stages contacts move through. Only admins and owners can change them."
        }
      />
      <PipelinesManager initialPipelines={pipelines} canManage={canManage} />
    </>
  );
}
