"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { PlanTier } from "@prisma/client";
import { Lock } from "lucide-react";

import { planLabel } from "@/components/app-shell/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";

import { apiFetch, errorMessage } from "./client-api";

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

  return (
    <Card>
      <form onSubmit={handleSubmit} noValidate className="flex h-full flex-col">
        <CardHeader>
          <CardTitle>Organization</CardTitle>
          <CardDescription>The account that holds the plan, the team and every workspace. Invoices use this name.</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 space-y-5">
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
          <dl className="grid grid-cols-3 gap-4 rounded-lg border bg-muted/30 px-4 py-3 text-[13px]">
            <div>
              <dt className="text-muted-foreground">Plan</dt>
              <dd className="mt-0.5 font-medium">{planLabel(organization.plan)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Workspaces</dt>
              <dd className="mt-0.5 font-medium tabular-nums">{workspaceCount}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Team</dt>
              <dd className="mt-0.5 font-medium tabular-nums">{memberCount}</dd>
            </div>
          </dl>
        </CardContent>
        <CardFooter className="justify-between gap-3 border-t pt-4">
          {canEdit ? (
            <p className="text-xs text-muted-foreground">{dirty ? "You have unsaved changes." : "Shown in the account menu and on invitations."}</p>
          ) : (
            <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" aria-hidden />
              Only admins and owners can rename the organization.
            </p>
          )}
          {canEdit ? (
            <Button type="submit" size="sm" loading={pending} disabled={!dirty}>
              Save changes
            </Button>
          ) : null}
        </CardFooter>
      </form>
    </Card>
  );
}
