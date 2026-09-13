import type { Metadata } from "next";
import Link from "next/link";

import { CenteredPage } from "@/components/layout/centered-page";
import { OrganizationPicker } from "@/components/organizations/organization-picker";
import { requireUser } from "@/lib/auth/session";
import { listOrganizationsForUser } from "@/lib/services/organizations";
import { readActiveOrganizationCookie } from "@/lib/workspace/cookie";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your organizations" };

/**
 * Every organization the user belongs to. Each is a separate account with its
 * own plan, team and workspaces; opening one switches the whole app over.
 */
export default async function OrganizationsPage() {
  const user = await requireUser();
  const [organizations, activeId] = await Promise.all([listOrganizationsForUser(user.id), readActiveOrganizationCookie()]);
  const currentId = organizations.some((o) => o.organization.id === activeId) ? activeId : (organizations[0]?.organization.id ?? null);

  return (
    <CenteredPage
      wide
      logoHref="/dashboard"
      footer={
        <>
          Signed in as <span className="font-medium text-foreground">{user.email}</span>
          {" · "}
          <Link href="/auth/signout" className="underline underline-offset-2 hover:text-foreground">
            Sign out
          </Link>
        </>
      }
    >
      <div className="mb-6 space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">Your organizations</h1>
        <p className="text-sm text-muted-foreground">
          Each organization is billed on its own and has its own team and workspaces. Open one to work in it.
        </p>
      </div>
      <OrganizationPicker
        organizations={organizations.map((o) => ({ ...o, joinedAt: o.joinedAt.toISOString() }))}
        currentId={currentId}
      />
    </CenteredPage>
  );
}
