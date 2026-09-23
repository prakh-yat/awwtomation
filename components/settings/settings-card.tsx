import * as React from "react";
import { Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The frame the settings forms share: a `brand-label` eyebrow, the fields, and
 * a footer that saves. Render it inside the <form> so the footer's button submits.
 */
export function SettingsCardHeader({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
      <h2 className="brand-label text-muted-foreground">{label}</h2>
      {children}
    </div>
  );
}

export function SettingsCardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("flex-1 px-5 pb-6 pt-4 sm:px-6", className)}>{children}</div>;
}

export function SettingsCardFooter({
  canEdit,
  dirty,
  pending,
  lockedLabel,
}: {
  canEdit: boolean;
  dirty: boolean;
  pending: boolean;
  /** Shown in place of the button to people who can't edit. */
  lockedLabel: string;
}) {
  return (
    <div className="flex min-h-[57px] items-center justify-between gap-3 border-t px-5 py-3 sm:px-6">
      {canEdit ? (
        dirty ? (
          <p className="inline-flex items-center gap-2 text-xs font-medium text-ink">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-orange" />
            Unsaved changes
          </p>
        ) : (
          <span />
        )
      ) : (
        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" aria-hidden />
          {lockedLabel}
        </p>
      )}
      {canEdit ? (
        <Button type="submit" size="sm" loading={pending} disabled={!dirty}>
          Save
        </Button>
      ) : null}
    </div>
  );
}
