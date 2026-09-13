"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { apiFetch, errorMessage } from "@/components/settings/client-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CreateOrganizationForm() {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clean = name.trim();
    if (clean.length < 2) {
      setError("Use at least 2 characters.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await apiFetch("/api/organizations", { method: "POST", json: { name: clean } });
      router.push("/channels?onboarding=1");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't create the organization."));
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div className="space-y-2">
        <Label htmlFor="organization-name">Organization name</Label>
        <Input
          id="organization-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Himalayan Threads"
          autoFocus
          autoComplete="organization"
          maxLength={60}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "organization-name-error" : "organization-name-hint"}
          disabled={pending}
        />
        {error ? (
          <p id="organization-name-error" role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : (
          <p id="organization-name-hint" className="text-xs text-muted-foreground">
            Usually the business or agency that pays. Its first workspace gets the same name.
          </p>
        )}
      </div>
      <Button type="submit" className="w-full" loading={pending}>
        Create organization
      </Button>
    </form>
  );
}
