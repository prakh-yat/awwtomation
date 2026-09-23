import type { Metadata } from "next";
import Link from "next/link";

import { CenteredPage } from "@/components/layout/centered-page";
import { CreateOrganizationForm } from "@/components/organizations/create-organization-form";
import { requireUser } from "@/lib/auth/session";
import { brand } from "@/lib/brand";
import { prisma } from "@/lib/db";
import { MAX_OWNED_ORGANIZATIONS } from "@/lib/services/organizations";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New organization" };

export default async function NewOrganizationPage() {
  const user = await requireUser();
  const [owned, memberships] = await Promise.all([
    prisma.organizationMember.count({ where: { userId: user.id, role: "OWNER" } }),
    prisma.organizationMember.count({ where: { userId: user.id } }),
  ]);
  const atLimit = owned >= MAX_OWNED_ORGANIZATIONS;

  return (
    <CenteredPage
      logoHref="/dashboard"
      footer={
        memberships > 0 ? (
          <Link href="/dashboard" className="font-medium text-ink underline underline-offset-4 hover:text-ink/70">
            Back to the app
          </Link>
        ) : null
      }
    >
      <h1 className="font-display text-[32px] leading-none">New organization</h1>
      <p className="mt-3 text-[14px] text-muted-foreground">Starts on the Free plan, with its own team and billing.</p>
      <div className="mt-7">
        {atLimit ? (
          <p className="rounded-2xl bg-fog px-4 py-3.5 text-[14px]">
            You already own {MAX_OWNED_ORGANIZATIONS} organizations, the most one person can.{" "}
            <a href={`mailto:${brand.supportEmail}`} className="font-medium underline underline-offset-4">
              Email us
            </a>{" "}
            if you need more.
          </p>
        ) : (
          <CreateOrganizationForm />
        )}
      </div>
    </CenteredPage>
  );
}
