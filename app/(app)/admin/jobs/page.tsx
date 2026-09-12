import type { Metadata } from "next";

import { JobsTable } from "@/components/admin/jobs-table";
import { PageHeader } from "@/components/ui/page-header";
import { brand } from "@/lib/brand";
import { adminJobsQuerySchema, listJobs, parseAdminSearchParams } from "@/lib/services/admin";
import { requireSuperAdmin } from "@/lib/workspace/context";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: `Jobs · Admin · ${brand.name}` };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminJobsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireSuperAdmin();
  const query = parseAdminSearchParams(adminJobsQuerySchema, await searchParams);
  // The table pages client-side; the server only seeds the first page.
  const page = await listJobs({ ...query, cursor: undefined });

  return (
    <>
      <PageHeader
        title="Job queue"
        description="Postgres-backed queue processed by the worker. Retry failed jobs or cancel pending ones; refreshes every 10 seconds."
      />
      <JobsTable
        key={`${query.status ?? ""}|${query.type ?? ""}`}
        initial={page}
        initialFilters={{ status: query.status ?? null, type: query.type ?? null }}
      />
    </>
  );
}
