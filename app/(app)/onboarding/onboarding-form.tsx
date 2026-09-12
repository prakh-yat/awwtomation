"use client";

import { useActionState } from "react";

import { createWorkspaceAction, type CreateWorkspaceState } from "./actions";

const initialState: CreateWorkspaceState = {};

export function OnboardingForm({ defaultName }: { defaultName: string }) {
  const [state, formAction, pending] = useActionState(createWorkspaceAction, initialState);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <div className="space-y-2">
        <label htmlFor="workspace-name" className="text-sm font-medium">
          Workspace name
        </label>
        <input
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
          className="flex h-10 w-full rounded-md border border-input bg-white px-3 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 aria-[invalid=true]:border-destructive"
          placeholder="Acme Studio"
        />
        {state.error ? (
          <p id="workspace-name-error" role="alert" className="text-xs text-destructive">
            {state.error}
          </p>
        ) : (
          <p id="workspace-name-hint" className="text-xs text-muted-foreground">
            Usually your brand or agency name. You can rename it any time in Settings.
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-card transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? (
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground"
          />
        ) : null}
        {pending ? "Creating workspace…" : "Create workspace"}
        {!pending ? (
          <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </button>
    </form>
  );
}
