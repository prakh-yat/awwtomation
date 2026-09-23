"use client";

import { useActionState } from "react";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { createOrganizationAction, type CreateOrganizationState } from "./actions";

const initialState: CreateOrganizationState = {};

export function OnboardingForm({ defaultName }: { defaultName: string }) {
  const [state, formAction, pending] = useActionState(createOrganizationAction, initialState);

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <div className="space-y-2">
        <Label htmlFor="workspace-name">Organization name</Label>
        <Input
          id="workspace-name"
          name="name"
          type="text"
          defaultValue={defaultName}
          autoFocus
          autoComplete="organization"
          maxLength={60}
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "workspace-name-error" : "workspace-name-hint"}
          placeholder="Himalayan Threads"
          className="h-12 rounded-2xl px-4 text-[16px]"
        />
        {state.error ? (
          <p id="workspace-name-error" role="alert" className="text-[12px] text-destructive">
            {state.error}
          </p>
        ) : (
          <p id="workspace-name-hint" className="text-[12px] text-muted-foreground">
            Your business or agency name. You can change it later.
          </p>
        )}
      </div>

      <Button type="submit" size="lg" className="h-12 w-full" loading={pending}>
        {pending ? "Creating…" : "Create organization"}
        {pending ? null : <ArrowRight />}
      </Button>
    </form>
  );
}
