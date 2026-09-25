"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PlanTier, WorkspaceRole } from "@prisma/client";
import { ChevronRight, Loader2, Plus } from "lucide-react";

import { planLabel, roleLabel } from "@/components/app-shell/types";
import { apiFetch, errorMessage } from "@/components/settings/client-api";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

export type PickerOrganization = {
  organization: { id: string; name: string; plan: PlanTier };
  role: WorkspaceRole;
  workspaceCount: number;
};

/** Plan badges climb the palette with the tier. */
const PLAN_BADGE: Record<PlanTier, BadgeVariant> = {
  NONE: "secondary",
  STARTER: "sky",
  PRO: "purple",
  AGENCY: "indigo",
};

export function OrganizationPicker({ organizations, currentId }: { organizations: PickerOrganization[]; currentId: string | null }) {
  const router = useRouter();
  const [openingId, setOpeningId] = React.useState<string | null>(null);

  async function open(id: string) {
    if (id === currentId) {
      router.push("/dashboard");
      return;
    }
    setOpeningId(id);
    try {
      await apiFetch("/api/organizations/active", { method: "POST", json: { organizationId: id } });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't open that organization."));
      setOpeningId(null);
    }
  }

  return (
    <div className="space-y-3">
      {organizations.length > 0 ? (
        <ul className="space-y-2">
          {organizations.map(({ organization, role, workspaceCount }, i) => {
            const current = organization.id === currentId;
            return (
              <li key={organization.id} className="rise" style={{ "--i": Math.min(i, 12) } as React.CSSProperties}>
                <button
                  type="button"
                  onClick={() => open(organization.id)}
                  disabled={openingId !== null}
                  aria-current={current ? "true" : undefined}
                  className={cn(
                    "group flex w-full items-center gap-3.5 rounded-2xl border bg-card p-3.5 text-left outline-none",
                    "transition-[border-color,background-color] duration-200 ease-soft",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-default",
                    current ? "border-ink/70" : "enabled:hover:border-ink/35 enabled:hover:bg-fog/50",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-display text-[18px] tracking-normal",
                      current ? "bg-yellow text-ink" : "bg-ink text-white",
                    )}
                  >
                    {organization.name.trim().charAt(0).toUpperCase() || "?"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[15px] font-semibold">{organization.name}</span>
                      {current ? (
                        <Badge variant="success" dot className="shrink-0">
                          Current
                        </Badge>
                      ) : null}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
                      <Badge variant={PLAN_BADGE[organization.plan]}>{planLabel(organization.plan)}</Badge>
                      <span>
                        {roleLabel(role)} · {workspaceCount} {workspaceCount === 1 ? "workspace" : "workspaces"}
                      </span>
                    </span>
                  </span>
                  {openingId === organization.id ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-label="Opening" />
                  ) : (
                    <ChevronRight
                      aria-hidden
                      className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-soft group-hover:translate-x-0.5 motion-reduce:transition-none"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-2xl bg-fog px-4 py-3.5 text-[14px] text-muted-foreground">You aren&apos;t in any organization yet.</p>
      )}

      <Button asChild variant="outline" className="h-11 w-full">
        <Link href="/organizations/new">
          <Plus />
          Create organization
        </Link>
      </Button>
    </div>
  );
}
