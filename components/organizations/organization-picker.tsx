"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PlanTier, WorkspaceRole } from "@prisma/client";
import { ChevronRight, Loader2, Plus } from "lucide-react";

import { planLabel, roleLabel } from "@/components/app-shell/types";
import { apiFetch, errorMessage } from "@/components/settings/client-api";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

export type PickerOrganization = {
  organization: { id: string; name: string; plan: PlanTier };
  role: WorkspaceRole;
  workspaceCount: number;
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
        <ul className="divide-y overflow-hidden rounded-lg border">
          {organizations.map(({ organization, role, workspaceCount }) => {
            const current = organization.id === currentId;
            return (
              <li key={organization.id}>
                <button
                  type="button"
                  onClick={() => open(organization.id)}
                  disabled={openingId !== null}
                  className={cn(
                    "flex w-full items-center gap-3 px-3.5 py-3 text-left outline-none transition-colors focus-visible:bg-muted disabled:cursor-default",
                    current ? "bg-muted/50" : "hover:bg-muted/40",
                  )}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
                    {organization.name.trim().charAt(0).toUpperCase() || "?"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{organization.name}</span>
                      {current ? <span className="shrink-0 rounded-full border px-1.5 text-[11px] text-muted-foreground">Current</span> : null}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {planLabel(organization.plan)} plan · {roleLabel(role)} · {workspaceCount} {workspaceCount === 1 ? "workspace" : "workspaces"}
                    </span>
                  </span>
                  {openingId === organization.id ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">You aren&apos;t in any organization yet.</p>
      )}
      <Link
        href="/organizations/new"
        className="flex h-10 items-center justify-center gap-2 rounded-md border border-dashed text-sm font-medium outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus className="h-4 w-4" />
        Create organization
      </Link>
    </div>
  );
}
