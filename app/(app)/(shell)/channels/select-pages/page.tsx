import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AlertCircle } from "lucide-react";

import { SelectPagesForm } from "@/components/channels/select-pages-form";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { checkLimit } from "@/lib/billing/usage";
import { categorise } from "@/lib/errors/customer-messages";
import { logger } from "@/lib/logger";
import { MetaApiError } from "@/lib/meta/types";
import {
  FACEBOOK_CONNECT_COOKIE,
  listFacebookPagesForSelection,
  parseFacebookConnectSession,
  type SelectablePage,
} from "@/lib/services/channels";
import { requireWorkspaceContext } from "@/lib/workspace/context";
import { canManageChannels } from "@/lib/workspace/permissions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Choose a Facebook Page" };

/**
 * Step 2 of the Facebook connect flow. The OAuth callback parked the user
 * token in a 10-minute signed cookie; this page lists the Pages behind it.
 * Anything stale or belonging to another user/workspace bounces back to the
 * dashboard with an explanatory toast.
 */
export default async function SelectPagesPage() {
  const ctx = await requireWorkspaceContext();
  if (!canManageChannels(ctx.role)) redirect("/dashboard?error=forbidden");

  const store = await cookies();
  const session = parseFacebookConnectSession(store.get(FACEBOOK_CONNECT_COOKIE)?.value);
  if (!session || session.workspaceId !== ctx.workspace.id || session.userId !== ctx.user.id) {
    redirect("/dashboard?error=fb_session_expired");
  }

  let pages: SelectablePage[] = [];
  let loadError: string | null = null;
  try {
    pages = await listFacebookPagesForSelection(ctx.workspace.id, session.userToken);
  } catch (err) {
    if (!(err instanceof MetaApiError)) throw err;
    logger.warn("channels.select_pages_load_failed", { workspaceId: ctx.workspace.id, code: err.code, message: err.message });
    loadError = categorise(err).description;
  }
  const slots = await checkLimit(ctx.workspace.id, "channels");

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        backHref="/dashboard?accounts=1"
        backLabel="Accounts"
        title="Choose a Facebook Page"
      />

      {loadError ? (
        <EmptyState
          icon={AlertCircle}
          tone="indigo"
          title="Facebook didn't return your Pages"
          description={loadError}
          action={
            <Button asChild>
              <a href="/api/meta/facebook/start">
                <PlatformIcon platform="FACEBOOK" />
                Try again
              </a>
            </Button>
          }
        />
      ) : pages.length === 0 ? (
        <EmptyState
          icon={<PlatformIcon platform="FACEBOOK" size={24} />}
          tone="blue"
          title="No Pages found"
          description="Sign in again, choose Edit settings and tick your Page."
          action={
            <Button asChild>
              <a href="/api/meta/facebook/start">
                <PlatformIcon platform="FACEBOOK" />
                Sign in again
              </a>
            </Button>
          }
        />
      ) : (
        <SelectPagesForm pages={pages} remainingSlots={Math.max(slots.limit - slots.used, 0)} planLimit={slots.limit} />
      )}
    </div>
  );
}
