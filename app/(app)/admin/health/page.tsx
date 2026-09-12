import type { Metadata } from "next";

import { HealthDashboard } from "@/components/admin/health-dashboard";
import { PageHeader } from "@/components/ui/page-header";
import { brand } from "@/lib/brand";
import { getHealth } from "@/lib/services/admin";
import { requireSuperAdmin } from "@/lib/workspace/context";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: `Health · Admin · ${brand.name}` };

export default async function AdminHealthPage() {
  await requireSuperAdmin();
  const health = await getHealth();

  return (
    <>
      <PageHeader
        title="System health"
        description="Database, worker, queue and Meta configuration at a glance. Refreshes every 15 seconds."
      />
      <HealthDashboard initial={health} />
    </>
  );
}
