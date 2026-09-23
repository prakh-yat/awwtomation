import type { Metadata } from "next";

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
          Signed in as <span className="font-medium text-ink">{user.email}</span>
          {" · "}
          {/* A plain link: `/auth/signout` is a route handler, and a prefetch would sign you out. */}
          <a href="/auth/signout" className="font-medium text-ink underline underline-offset-4 hover:text-ink/70">
            Sign out
          </a>
        </>
      }
    >
      <h1 className="font-display text-[32px] leading-none">Your organizations</h1>
      <div className="mt-7">
        <OrganizationPicker
          organizations={organizations.map((o) => ({ ...o, joinedAt: o.joinedAt.toISOString() }))}
          currentId={currentId}
        />
      </div>
    </CenteredPage>
  );
}
