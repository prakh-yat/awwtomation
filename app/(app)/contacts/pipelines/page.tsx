import type { Metadata } from "next";

import { PipelinesManager } from "@/components/pipelines/pipelines-manager";
import { listPipelines } from "@/lib/services/pipelines";
import { requireWorkspaceContext } from "@/lib/workspace/context";
import { canManageSettings } from "@/lib/workspace/permissions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Pipelines" };

/** The manager renders the page header itself: "New pipeline" sits in it. */
export default async function PipelinesPage() {
  const ctx = await requireWorkspaceContext();
  const pipelines = await listPipelines(ctx.workspace.id);
  const canManage = canManageSettings(ctx.role);

  return <PipelinesManager initialPipelines={pipelines} canManage={canManage} />;
}
