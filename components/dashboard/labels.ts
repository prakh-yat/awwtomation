import type { AutomationStatus } from "@prisma/client";

export const AUTOMATION_STATUS_LABELS: Record<AutomationStatus, string> = {
  ACTIVE: "Active",
  PAUSED: "Paused",
  DRAFT: "Draft",
};

/** "@handle" from whichever identifier we have; falls back to the display name. */
export function contactHandle(username: string | null | undefined, name?: string | null): string {
  const clean = username?.trim().replace(/^@/, "");
  if (clean) return `@${clean}`;
  return name?.trim() || "an account";
}
