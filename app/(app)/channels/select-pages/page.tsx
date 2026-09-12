import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AlertCircle } from "lucide-react";

import { SelectPagesForm } from "@/components/channels/select-pages-form";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { checkLimit } from "@/lib/billing/usage";
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

export const metadata: Metadata = { title: "Choose Facebook Pages" };

/**
 * Step 2 of the Facebook connect flow. The OAuth callback parked the user
 * token in a 10-minute signed cookie; this page lists the Pages behind it.
 * Anything stale or belonging to another user/workspace bounces back to
 * /channels with an explanatory toast.
 */
export default async function SelectPagesPage() {
  const ctx = await requireWorkspaceContext();
  if (!canManageChannels(ctx.role)) redirect("/channels?error=forbidden");

  const store = await cookies();
  const session = parseFacebookConnectSession(store.get(FACEBOOK_CONNECT_COOKIE)?.value);
  if (!session || session.workspaceId !== ctx.workspace.id || session.userId !== ctx.user.id) {
    redirect("/channels?error=fb_session_expired");
  }

  let pages: SelectablePage[] = [];
  let loadError: string | null = null;
  try {
    pages = await listFacebookPagesForSelection(ctx.workspace.id, session.userToken);
  } catch (err) {
    if (!(err instanceof MetaApiError)) throw err;
    logger.warn("channels.select_pages_load_failed", { workspaceId: ctx.workspace.id, code: err.code, message: err.message });
    loadError = err.message;
  }
  const slots = await checkLimit(ctx.workspace.id, "channels");

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        backHref="/channels"
        backLabel="Channels"
        title="Choose Facebook Pages"
        description="Pick the Pages to automate. Each Page becomes its own channel with its own automations and inbox."
      />

      {loadError ? (
        <EmptyState
          icon={AlertCircle}
          title="Facebook didn't return your Pages"
          description={loadError}
          action={
            <Button asChild>
              <a href="/api/meta/facebook/start">Try again</a>
            </Button>
          }
        />
      ) : pages.length === 0 ? (
        <EmptyState
          title="No Pages found"
          description="Your Facebook account doesn't manage any Pages, or none were granted during sign-in. Create a Page or re-run the connection and grant access to at least one."
          action={
            <Button asChild>
              <a href="/api/meta/facebook/start">Sign in again</a>
            </Button>
          }
        />
      ) : (
        <SelectPagesForm pages={pages} remainingSlots={Math.max(slots.limit - slots.used, 0)} planLimit={slots.limit} />
      )}
    </div>
  );
}
