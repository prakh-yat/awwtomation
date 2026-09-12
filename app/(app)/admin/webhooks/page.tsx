import type { Metadata } from "next";
import Link from "next/link";
import { Webhook } from "lucide-react";

import { FilterLinks } from "@/components/admin/filter-links";
import { hrefWith } from "@/components/admin/format";
import { CursorPagination } from "@/components/admin/pagination";
import { WebhookEventsTable } from "@/components/admin/webhook-events-table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { brand } from "@/lib/brand";
import { adminWebhooksQuerySchema, listWebhookEvents, parseAdminSearchParams } from "@/lib/services/admin";
import { requireSuperAdmin } from "@/lib/workspace/context";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: `Webhooks · Admin · ${brand.name}` };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const PATH = "/admin/webhooks";

export default async function AdminWebhooksPage({ searchParams }: { searchParams: SearchParams }) {
  await requireSuperAdmin();
  const query = parseAdminSearchParams(adminWebhooksQuerySchema, await searchParams);
  const page = await listWebhookEvents(query);

  const processedParam = query.processed === undefined ? undefined : String(query.processed);
  const base = { processed: processedParam, platform: query.platform };
  const filtered = query.processed !== undefined || query.platform !== undefined;

  const processedLinks = [
    { label: "All", href: hrefWith(PATH, { platform: query.platform }), active: query.processed === undefined },
    { label: "Processed", href: hrefWith(PATH, { platform: query.platform, processed: "true" }), active: query.processed === true },
    { label: "Failed", href: hrefWith(PATH, { platform: query.platform, processed: "false" }), active: query.processed === false },
  ];
  const platformLinks = [
    { label: "Both platforms", href: hrefWith(PATH, { processed: processedParam }), active: query.platform === undefined },
    { label: "Instagram", href: hrefWith(PATH, { processed: processedParam, platform: "INSTAGRAM" }), active: query.platform === "INSTAGRAM" },
    { label: "Facebook", href: hrefWith(PATH, { processed: processedParam, platform: "FACEBOOK" }), active: query.platform === "FACEBOOK" },
  ];

  return (
    <>
      <PageHeader
        title="Webhook events"
        description="Raw receipts from Meta, stored before processing for idempotency and debugging. Click a row to see the payload."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterLinks label="Processing state" items={processedLinks} />
        <FilterLinks label="Platform" items={platformLinks} />
      </div>

      {page.items.length === 0 ? (
        <EmptyState
          icon={Webhook}
          title={filtered ? "No events match" : "No webhook events yet"}
          description={
            filtered
              ? "Try a different state or platform."
              : "Events arrive once a channel is connected and Meta starts delivering comments and messages."
          }
          action={
            filtered ? (
              <Button asChild variant="outline" size="sm">
                <Link href={PATH}>Clear filters</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-lg border bg-card shadow-card">
          <WebhookEventsTable items={page.items} />
          <CursorPagination
            shown={page.items.length}
            total={page.total}
            noun="events"
            nextHref={page.nextCursor ? hrefWith(PATH, { ...base, cursor: page.nextCursor }) : null}
            resetHref={hrefWith(PATH, base)}
            isPaged={Boolean(query.cursor)}
          />
        </div>
      )}
    </>
  );
}
