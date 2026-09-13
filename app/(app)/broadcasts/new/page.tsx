import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BroadcastEditor } from "@/components/broadcasts/broadcast-editor";
import { effectivePlan } from "@/lib/billing/entitlements";
import { limitsFor } from "@/lib/billing/plans";
import { listBroadcastChannels } from "@/lib/services/broadcasts";
import { requireWorkspaceContext } from "@/lib/workspace/context";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New broadcast" };

export default async function NewBroadcastPage() {
  const ctx = await requireWorkspaceContext();
  // The list page explains the upgrade path; don't render an editor that can only 402.
  if (!limitsFor(effectivePlan(ctx.organization)).broadcasts) redirect("/broadcasts");

  const channels = await listBroadcastChannels(ctx.workspace.id);
  return <BroadcastEditor mode="create" channels={channels} timeZone={ctx.workspace.timezone} />;
}
