import type { Metadata } from "next";
import Link from "next/link";
import { Megaphone, Plus } from "lucide-react";

import { AutoRefresh } from "@/components/broadcasts/auto-refresh";
import { BroadcastList } from "@/components/broadcasts/broadcast-list";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { effectivePlan } from "@/lib/billing/entitlements";
import { limitsFor } from "@/lib/billing/plans";
import { listBroadcasts, toBroadcastRow } from "@/lib/services/broadcasts";
import { requireWorkspaceContext } from "@/lib/workspace/context";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Broadcasts" };

const DESCRIPTION = "Message a group of contacts at once. It reaches the people who messaged you in the last 24 hours.";

export default async function BroadcastsPage() {
  const ctx = await requireWorkspaceContext();
  const plan = limitsFor(effectivePlan(ctx.organization));

  if (!plan.broadcasts) {
    return (
      <>
        <PageHeader title="Broadcasts" description={DESCRIPTION} />
        <EmptyState
          icon={Megaphone}
          title={`Broadcasts aren't included in the ${plan.label} plan`}
          description="Upgrade to Starter or above to message a group of contacts at once."
          action={
            <Button asChild>
              <Link href="/settings/billing">
                See plans
              </Link>
            </Button>
          }
        />
      </>
    );
  }

  const broadcasts = await listBroadcasts(ctx.workspace.id);
  const rows = broadcasts.map(toBroadcastRow);
  const anySending = rows.some((r) => r.status === "SENDING");

  return (
    <>
      <PageHeader
        title="Broadcasts"
        description={DESCRIPTION}
        actions={
          <Button asChild>
            <Link href="/broadcasts/new">
              <Plus />
              New broadcast
            </Link>
          </Button>
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No broadcasts yet"
          description="Choose who gets it by tag or saved segment, write the message and send it now or later."
          action={
            <Button asChild>
              <Link href="/broadcasts/new">
                <Plus />
                Create your first broadcast
              </Link>
            </Button>
          }
        />
      ) : (
        <BroadcastList rows={rows} timeZone={ctx.workspace.timezone} />
      )}
      {anySending ? <AutoRefresh intervalMs={5000} /> : null}
    </>
  );
}
