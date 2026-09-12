"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { PlanTier } from "@prisma/client";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { PLAN_LABELS, PLAN_TIERS } from "./constants";
import { hrefWith } from "./format";

const ALL = "ALL";

/**
 * URL-driven filters: the server page owns the data, this just navigates.
 * The page keys this component on the current filters so it resets cleanly.
 */
export function WorkspaceFilters({ q, plan }: { q: string; plan: PlanTier | null }) {
  const router = useRouter();
  const [search, setSearch] = React.useState(q);

  function go(nextQ: string, nextPlan: PlanTier | null) {
    router.push(hrefWith("/admin/workspaces", { q: nextQ.trim() || undefined, plan: nextPlan ?? undefined }));
  }

  const active = q.length > 0 || plan !== null;

  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-center"
      onSubmit={(e) => {
        e.preventDefault();
        go(search, plan);
      }}
    >
      <div className="relative sm:w-80">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, slug or owner email"
          aria-label="Search workspaces"
          className="pl-8"
        />
      </div>
      <Select value={plan ?? ALL} onValueChange={(v) => go(search, v === ALL ? null : (v as PlanTier))}>
        <SelectTrigger className="sm:w-40" aria-label="Filter by plan">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All plans</SelectItem>
          {PLAN_TIERS.map((p) => (
            <SelectItem key={p} value={p}>
              {PLAN_LABELS[p]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" variant="outline">
        Search
      </Button>
      {active ? (
        <Button type="button" variant="ghost" onClick={() => go("", null)}>
          <X />
          Clear
        </Button>
      ) : null}
    </form>
  );
}
