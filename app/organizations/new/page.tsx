import type { Metadata } from "next";
import Link from "next/link";

import { CenteredPage } from "@/components/layout/centered-page";
import { CreateOrganizationForm } from "@/components/organizations/create-organization-form";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { MAX_OWNED_ORGANIZATIONS } from "@/lib/services/organizations";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Create an organization" };

export default async function NewOrganizationPage() {
  const user = await requireUser();
  const [owned, memberships] = await Promise.all([
    prisma.organizationMember.count({ where: { userId: user.id, role: "OWNER" } }),
    prisma.organizationMember.count({ where: { userId: user.id } }),
  ]);
  const atLimit = owned >= MAX_OWNED_ORGANIZATIONS;

  return (
    <CenteredPage logoHref="/dashboard" footer={memberships > 0 ? <Link href="/dashboard" className="underline underline-offset-2 hover:text-foreground">Back to the app</Link> : null}>
      <div className="mb-6 space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">Create an organization</h1>
        <p className="text-sm text-muted-foreground">
          A separate account with its own plan, team and workspaces, billed on its own. It starts on the Free plan with one workspace.
        </p>
      </div>
      {atLimit ? (
        <p className="rounded-md border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
          You already own {MAX_OWNED_ORGANIZATIONS} organizations, the most one person can. Email us if you need more.
        </p>
      ) : (
        <CreateOrganizationForm />
      )}
    </CenteredPage>
  );
}
