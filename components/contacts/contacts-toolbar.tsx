"use client";

import * as React from "react";
import { Search, UserRound, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { type OwnerOption, ownerLabel } from "./contact-details-card";
import { filterPill } from "./filter-pill";

const ALL = "all";
const UNASSIGNED = "unassigned";

/** The toolbar's search box: a pill, with a clear button once something is typed. */
export const SearchField = React.forwardRef<HTMLInputElement, { value: string; onChange: (q: string) => void; className?: string }>(
  ({ value, onChange, className }, ref) => (
    <div className={cn("relative w-full sm:w-64", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search contacts"
        className="h-8 rounded-full pl-8 pr-8 text-[13px]"
        aria-label="Search contacts"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-fog hover:text-ink"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  ),
);
SearchField.displayName = "SearchField";

/**
 * Owner filter as a pill: anyone, unassigned, then the team with the viewer
 * first as "Assigned to me". The pill names the choice once one is made.
 */
export function OwnerFilter({
  value,
  owners,
  viewerId,
  onChange,
}: {
  /** A member id, "unassigned", or "" for anyone. */
  value: string;
  /** Workspace members, the viewer first. */
  owners: OwnerOption[];
  viewerId: string;
  onChange: (ownerId: string) => void;
}) {
  const owner = owners.find((o) => o.id === value);
  const label = !value ? "Owner" : value === UNASSIGNED ? "Unassigned" : value === viewerId ? "Assigned to me" : owner ? ownerLabel(owner) : "Owner";

  return (
    <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? "" : v)}>
      <SelectTrigger className={cn(filterPill(Boolean(value)), "w-auto max-w-[14rem] py-0 [&>svg]:h-3.5 [&>svg]:w-3.5")} aria-label="Owner">
        <UserRound className="shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>Any owner</SelectItem>
        <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
        {owners.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.id === viewerId ? "Assigned to me" : ownerLabel(o)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
