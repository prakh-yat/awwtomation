"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { PlanSource, PlanTier } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { PLANS } from "@/lib/billing/plans";
import type { SetPlanResult } from "@/lib/services/admin";
import { formatNumber } from "@/lib/utils";

import { adminFetch } from "./api";
import { PLAN_LABELS, PLAN_TIERS } from "./constants";

function describe(plan: PlanTier): string {
  const l = PLANS[plan];
  return `${l.channels} channel${l.channels === 1 ? "" : "s"} · ${l.automations} automations · ${formatNumber(l.dmsPerMonth)} DMs/mo · ${l.members} seat${l.members === 1 ? "" : "s"} · $${l.priceUsd}/mo`;
}

/**
 * Plan override: pick → confirm → POST → refresh the server-rendered detail page.
 * Picking a plan marks the workspace ADMIN_OVERRIDE so Dodo webhooks stop
 * moving `plan`; "Clear override" hands control back to the subscription.
 */
export function PlanSelector({
  workspaceId,
  workspaceName,
  plan,
  planSource = "DEFAULT",
  hasSubscription = false,
}: {
  workspaceId: string;
  workspaceName: string;
  plan: PlanTier;
  planSource?: PlanSource;
  hasSubscription?: boolean;
}) {
  const router = useRouter();
  const [current, setCurrent] = React.useState(plan);
  const [pending, setPending] = React.useState<PlanTier | null>(null);
  const [clearing, setClearing] = React.useState(false);

  async function confirm() {
    if (!pending) return;
    try {
      const result = await adminFetch<SetPlanResult>(`/api/admin/workspaces/${workspaceId}/plan`, {
        method: "POST",
        body: JSON.stringify({ plan: pending }),
      });
      setCurrent(result.workspace.plan);
      toast.success(`${workspaceName} is now on ${PLAN_LABELS[result.workspace.plan]} (admin override)`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change plan");
      // Rethrow so ConfirmDialog stays open for a retry.
      throw err;
    }
  }

  async function clearOverride() {
    try {
      const result = await adminFetch<SetPlanResult>(`/api/admin/workspaces/${workspaceId}/plan`, { method: "DELETE" });
      setCurrent(result.workspace.plan);
      toast.success(
        result.workspace.planSource === "SUBSCRIPTION"
          ? `Override cleared — ${workspaceName} follows its subscription (${PLAN_LABELS[result.workspace.plan]})`
          : `Override cleared — ${workspaceName} is back on ${PLAN_LABELS[result.workspace.plan]}`,
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not clear the override");
      throw err;
    }
  }

  return (
    <>
      <Select
        value={current}
        onValueChange={(v) => {
          if (v !== current || planSource !== "ADMIN_OVERRIDE") setPending(v as PlanTier);
        }}
      >
        <SelectTrigger className="w-44" aria-label="Workspace plan">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PLAN_TIERS.map((p) => (
            <SelectItem key={p} value={p}>
              {PLAN_LABELS[p]}
              <span className="ml-1.5 text-muted-foreground">${PLANS[p].priceUsd}/mo</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {planSource === "ADMIN_OVERRIDE" ? (
        <ConfirmDialog
          trigger={
            <Button variant="outline" size="sm" loading={clearing}>
              Clear override
            </Button>
          }
          open={clearing}
          onOpenChange={setClearing}
          title={`Clear the plan override for ${workspaceName}?`}
          description={
            hasSubscription
              ? "The plan will follow the workspace's Dodo subscription again (re-synced now). Limits apply immediately."
              : "There's no subscription on file, so the workspace returns to the Free plan. Limits apply immediately."
          }
          confirmLabel="Clear override"
          onConfirm={clearOverride}
        />
      ) : null}
      <ConfirmDialog
        trigger={null}
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={pending ? `Move ${workspaceName} to ${PLAN_LABELS[pending]}?` : "Change plan"}
        description={
          pending
            ? `${describe(pending)}. Limits apply immediately; DMs already sent this period are kept. This becomes an admin override — billing webhooks stop changing the plan until you clear it. Recorded in the audit log.`
            : undefined
        }
        confirmLabel="Override plan"
        onConfirm={confirm}
      />
    </>
  );
}
