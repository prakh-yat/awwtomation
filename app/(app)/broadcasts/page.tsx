import type { Metadata } from "next";
import Link from "next/link";
import { Megaphone, Plus, Zap } from "lucide-react";

import { AutoRefresh } from "@/components/broadcasts/auto-refresh";
import { BroadcastList } from "@/components/broadcasts/broadcast-list";
import { WindowCallout } from "@/components/broadcasts/window-callout";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { effectivePlan } from "@/lib/billing/entitlements";
import { limitsFor } from "@/lib/billing/plans";
import { listBroadcasts, toBroadcastRow } from "@/lib/services/broadcasts";
import { requireWorkspaceContext } from "@/lib/workspace/context";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Broadcasts" };

const DESCRIPTION = "Send one message to everyone in a tagged audience who is inside the 24-hour window.";

export default async function BroadcastsPage() {
  const ctx = await requireWorkspaceContext();
  const plan = limitsFor(effectivePlan(ctx.workspace));

  if (!plan.broadcasts) {
    return (
      <>
        <PageHeader title="Broadcasts" description={DESCRIPTION} />
        <EmptyState
          icon={Megaphone}
          title={`Broadcasts aren't included in the ${plan.label} plan`}
          description="Upgrade to Starter or above to message a tagged audience in one go. Contacts outside the 24-hour window are skipped automatically, per Meta's rules."
          action={
            <Button asChild>
              <Link href="/settings/billing">
                <Zap />
                Upgrade plan
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
      <WindowCallout compact className="mb-6" />
      {rows.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No broadcasts yet"
          description="Pick a channel, filter contacts by tag and send a message to everyone who has messaged you in the last 24 hours."
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
