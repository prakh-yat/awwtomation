"use client";

import * as React from "react";
import { Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";

import { updateWorkspaceAction } from "@/app/(app)/settings/actions";
import { TIMEZONE_GROUPS, timezoneCity, timezoneOffset, withCurrentZone } from "./timezones";

export interface GeneralFormProps {
  workspace: { name: string; timezone: string };
  /** ADMIN+ may edit; members get a read-only view of the same fields. */
  canEdit: boolean;
}

type FieldError = { field?: "name" | "timezone"; message: string };

/**
 * Name + timezone form. Mount it with a `key` derived from the saved values
 * so a successful save (which revalidates the page) resets local edits.
 */
export function GeneralForm({ workspace, canEdit }: GeneralFormProps) {
  const [pending, startTransition] = React.useTransition();
  const [name, setName] = React.useState(workspace.name);
  const [timezone, setTimezone] = React.useState(workspace.timezone);
  const [error, setError] = React.useState<FieldError | null>(null);

  const groups = React.useMemo(() => withCurrentZone(TIMEZONE_GROUPS, workspace.timezone), [workspace.timezone]);
  // Offsets are DST-aware, so compute them once per mount rather than per keystroke.
  const offsets = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const group of groups) for (const zone of group.zones) map.set(zone, timezoneOffset(zone));
    return map;
  }, [groups]);

  const dirty = name.trim() !== workspace.name || timezone !== workspace.timezone;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || pending || !dirty) return;
    const formData = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await updateWorkspaceAction(formData);
      if (!result.ok) {
        setError({ field: result.field, message: result.error });
        toast.error(result.error);
        return;
      }
      toast.success("Workspace settings saved");
    });
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} noValidate>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
          <CardDescription>
            The name appears in the sidebar and invitations. The timezone is used for reports and scheduled sends.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="workspace-name">Name</Label>
            <Input
              id="workspace-name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              autoComplete="organization"
              disabled={!canEdit || pending}
              aria-invalid={error?.field === "name" ? true : undefined}
              aria-describedby={error?.field === "name" ? "workspace-name-error" : undefined}
              placeholder="Acme Studio"
            />
            {error?.field === "name" ? (
              <p id="workspace-name-error" role="alert" className="text-xs text-destructive">
                {error.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="workspace-timezone">Timezone</Label>
            <Select value={timezone} onValueChange={setTimezone} disabled={!canEdit || pending}>
              <SelectTrigger
                id="workspace-timezone"
                aria-invalid={error?.field === "timezone" ? true : undefined}
                className="aria-[invalid=true]:border-destructive"
              >
                <SelectValue placeholder="Choose a timezone" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((group) => (
                  <SelectGroup key={group.region}>
                    <SelectLabel>{group.region}</SelectLabel>
                    {group.zones.map((zone) => (
                      <SelectItem key={zone} value={zone}>
                        <span className="flex items-center gap-2">
                          <span>{timezoneCity(zone)}</span>
                          <span className="text-[11px] tabular-nums text-muted-foreground">
                            {offsets.get(zone)}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            {/* Radix Select is not a native form control; mirror its value for the server action. */}
            <input type="hidden" name="timezone" value={timezone} />
            {error?.field === "timezone" ? (
              <p role="alert" className="text-xs text-destructive">
                {error.message}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">{timezone}</p>
            )}
          </div>
        </CardContent>
        <CardFooter className="justify-between gap-3 border-t pt-4">
          {canEdit ? (
            <p className="text-xs text-muted-foreground">
              {dirty ? "You have unsaved changes." : "Changes apply to everyone in this workspace."}
            </p>
          ) : (
            <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" aria-hidden />
              Only admins and owners can change these settings.
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
