import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { BroadcastEditor } from "@/components/broadcasts/broadcast-editor";
import { BroadcastReport } from "@/components/broadcasts/broadcast-report";
import { effectivePlan } from "@/lib/billing/entitlements";
import { limitsFor } from "@/lib/billing/plans";
import { getBroadcast, listBroadcastChannels, toBroadcastRow } from "@/lib/services/broadcasts";
import { requireWorkspaceContext } from "@/lib/workspace/context";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

/** generateMetadata and the page both need the broadcast — fetch it once per request. */
const loadBroadcast = cache((workspaceId: string, id: string) => getBroadcast(workspaceId, id));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const ctx = await requireWorkspaceContext();
  const broadcast = await loadBroadcast(ctx.workspace.id, id);
  return { title: broadcast ? broadcast.name : "Broadcast" };
}

/** Drafts and scheduled broadcasts open in the editor; anything that has started shows the report. */
export default async function BroadcastPage({ params }: Props) {
  const { id } = await params;
  const ctx = await requireWorkspaceContext();
  if (!limitsFor(effectivePlan(ctx.workspace)).broadcasts) redirect("/broadcasts");

  const detail = await loadBroadcast(ctx.workspace.id, id);
  if (!detail) notFound();

  const row = toBroadcastRow(detail);
  const timeZone = ctx.workspace.timezone;

  if (detail.status === "DRAFT" || detail.status === "SCHEDULED") {
    const channels = await listBroadcastChannels(ctx.workspace.id);
    return <BroadcastEditor key={row.updatedAt} mode="edit" broadcast={row} channels={channels} timeZone={timeZone} />;
  }

  return (
    <BroadcastReport
      row={row}
      stats={detail.stats}
      deliveries={detail.deliveries.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() }))}
      deliveryTotal={detail.deliveryTotal}
      timeZone={timeZone}
      channelAvatarUrl={detail.channel.avatarUrl}
    />
  );
}
