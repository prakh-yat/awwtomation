import type { Metadata } from "next";

import { InboxShell } from "@/components/inbox/inbox-shell";
import { getConversation, getInboxCounts, listConversations, listInboxChannels } from "@/lib/services/inbox";
import { requireWorkspaceContext } from "@/lib/workspace/context";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Inbox" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Server entry for /inbox. Loads just enough for first paint (channels, the
 * first page of open threads, counts, and the `?c=` thread when deep-linked);
 * the client shell owns everything after that.
 */
export default async function InboxPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireWorkspaceContext();
  const { c } = await searchParams;
  const requestedId = typeof c === "string" && c.length > 0 && c.length <= 64 ? c : null;
  const workspaceId = ctx.workspace.id;

  const [channels, page, counts, detail] = await Promise.all([
    listInboxChannels(workspaceId),
    listConversations(workspaceId, { status: "OPEN", viewerId: ctx.user.id }),
    getInboxCounts(workspaceId, ctx.user.id),
    requestedId ? getConversation(workspaceId, requestedId) : Promise.resolve(null),
  ]);

  return <InboxShell workspaceId={workspaceId} channels={channels} initialPage={page} initialCounts={counts} initialDetail={detail} />;
}
