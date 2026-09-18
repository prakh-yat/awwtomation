import type { Metadata } from "next";

import { ProvidersView } from "@/components/ai/providers-view";
import { PageHeader } from "@/components/ui/page-header";
import { listProviders } from "@/lib/services/ai";
import { requireWorkspaceContext } from "@/lib/workspace/context";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "AI providers" };

export default async function AiProvidersPage() {
  const ctx = await requireWorkspaceContext();
  const providers = await listProviders(ctx.workspace.id);
  const canManage = ctx.role === "OWNER" || ctx.role === "ADMIN";

  return (
    <>
      <PageHeader title="AI" />
      <ProvidersView providers={providers} canManage={canManage} />
    </>
  );
}
