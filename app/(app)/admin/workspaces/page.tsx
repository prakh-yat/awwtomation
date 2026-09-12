import type { Metadata } from "next";
import Link from "next/link";
import { Building2 } from "lucide-react";

import { hrefWith, formatUtcDate } from "@/components/admin/format";
import { LinkRow } from "@/components/admin/link-row";
import { CursorPagination } from "@/components/admin/pagination";
import { PlanBadge } from "@/components/admin/status-badge";
import { WorkspaceFilters } from "@/components/admin/workspace-filters";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { brand } from "@/lib/brand";
import { adminWorkspacesQuerySchema, listWorkspaces, parseAdminSearchParams } from "@/lib/services/admin";
import { cn, formatNumber } from "@/lib/utils";
import { requireSuperAdmin } from "@/lib/workspace/context";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: `Workspaces · Admin · ${brand.name}` };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminWorkspacesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireSuperAdmin();
  const query = parseAdminSearchParams(adminWorkspacesQuerySchema, await searchParams);
  const page = await listWorkspaces(query);

  const q = query.q ?? "";
  const plan = query.plan ?? null;
  const base = { q: query.q, plan: query.plan };
  const filtered = q.length > 0 || plan !== null;

  return (
    <>
      <PageHeader
        title="Workspaces"
        description="Every tenant on the platform with its plan, team size and DM usage this period."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/admin">Overview</Link>
          </Button>
        }
      />

      <div className="mb-4">
        <WorkspaceFilters key={`${q}|${plan ?? ""}`} q={q} plan={plan} />
      </div>

      {page.items.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={filtered ? "No workspaces match" : "No workspaces yet"}
          description={filtered ? "Try a different search or clear the plan filter." : "Workspaces appear here as soon as someone signs up."}
          action={
            filtered ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/workspaces">Clear filters</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-lg border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Workspace</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">Members</TableHead>
                <TableHead className="text-right">Channels</TableHead>
                <TableHead className="text-right">Automations</TableHead>
                <TableHead>DMs this period</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.items.map((ws) => {
                const pct = ws.dmLimit > 0 ? Math.min(100, Math.round((ws.dmsSentThisPeriod / ws.dmLimit) * 100)) : 0;
                return (
                  <LinkRow key={ws.id} href={`/admin/workspaces/${ws.id}`}>
                    <TableCell>
                      <Link href={`/admin/workspaces/${ws.id}`} className="font-medium underline-offset-4 hover:underline">
                        {ws.name}
                      </Link>
                      <p className="font-mono text-[11px] text-muted-foreground">{ws.slug}</p>
                    </TableCell>
                    <TableCell>
                      {ws.owner ? (
                        <>
                          <p className="truncate">{ws.owner.email}</p>
                          {ws.owner.name ? <p className="truncate text-xs text-muted-foreground">{ws.owner.name}</p> : null}
                        </>
                      ) : (
                        <span className="text-muted-foreground">No owner</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <PlanBadge plan={ws.plan} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{ws.counts.members}</TableCell>
                    <TableCell className="text-right tabular-nums">{ws.counts.channels}</TableCell>
                    <TableCell className="text-right tabular-nums">{ws.counts.automations}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn("h-full rounded-full", pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-warning" : "bg-foreground")}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="tabular-nums text-muted-foreground">
                          {formatNumber(ws.dmsSentThisPeriod)} / {formatNumber(ws.dmLimit)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{formatUtcDate(ws.createdAt)}</TableCell>
                  </LinkRow>
                );
              })}
            </TableBody>
          </Table>
          <CursorPagination
            shown={page.items.length}
            total={page.total}
            noun="workspaces"
            nextHref={page.nextCursor ? hrefWith("/admin/workspaces", { ...base, cursor: page.nextCursor }) : null}
            resetHref={hrefWith("/admin/workspaces", base)}
            isPaged={Boolean(query.cursor)}
          />
        </div>
      )}
    </>
  );
}
