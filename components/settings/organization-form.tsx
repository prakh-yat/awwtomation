"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { PlanTier } from "@prisma/client";

import { planLabel } from "@/components/app-shell/types";
import { PlanSwatch } from "@/components/billing/plan-badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";

import { apiFetch, errorMessage } from "./client-api";
import { SettingsCardBody, SettingsCardFooter, SettingsCardHeader } from "./settings-card";

export interface OrganizationFormProps {
  organization: { id: string; name: string; plan: PlanTier };
  workspaceCount: number;
  memberCount: number;
  canEdit: boolean;
}

/** The billable account's name. Mount with a `key` of the saved name so a refresh resets local edits. */
export function OrganizationForm({ organization, workspaceCount, memberCount, canEdit }: OrganizationFormProps) {
  const router = useRouter();
  const [name, setName] = React.useState(organization.name);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const dirty = name.trim() !== organization.name;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit || pending || !dirty) return;
    setPending(true);
    setError(null);
    try {
      await apiFetch(`/api/organizations/${organization.id}`, { method: "PATCH", json: { name: name.trim() } });
      toast.success("Organization renamed");
      router.refresh();
    } catch (err) {
      const message = errorMessage(err, "Couldn't rename the organization");
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  const facts = [
    { label: "Workspaces", value: workspaceCount },
    { label: "Team", value: memberCount },
  ];

  return (
    <Card className="rise flex flex-col rounded-3xl" style={{ "--i": 1 } as React.CSSProperties}>
      <form onSubmit={handleSubmit} noValidate className="flex flex-1 flex-col">
        <SettingsCardHeader label="Organization" />
        <SettingsCardBody className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="organization-name">Name</Label>
            <Input
              id="organization-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              autoComplete="organization"
              disabled={!canEdit || pending}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "organization-name-error" : undefined}
            />
            {error ? (
              <p id="organization-name-error" role="alert" className="text-xs text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          {/* Cells size to their content, so "Workspaces" never clips on a phone. */}
          <dl className="flex divide-x rounded-2xl bg-fog">
            <div className="min-w-0 flex-auto px-3 py-3 sm:px-4">
              <dt className="brand-label text-muted-foreground">Plan</dt>
              <dd className="font-display mt-1.5 flex items-center gap-2 text-[20px] leading-none">
                <PlanSwatch plan={organization.plan} className="h-2.5 w-2.5 rounded-[3px]" />
                <span className="truncate">{planLabel(organization.plan)}</span>
              </dd>
            </div>
            {facts.map((fact) => (
              <div key={fact.label} className="min-w-0 flex-auto px-3 py-3 sm:px-4">
                <dt className="brand-label truncate text-muted-foreground">{fact.label}</dt>
                <dd className="font-display mt-1.5 text-[20px] leading-none tabular-nums">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </SettingsCardBody>
        <SettingsCardFooter canEdit={canEdit} dirty={dirty} pending={pending} lockedLabel="Only admins and owners can rename it." />
      </form>
    </Card>
  );
}
