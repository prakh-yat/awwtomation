import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { appUrl } from "@/lib/env";
import { logger } from "@/lib/logger";
import { handleMetaDataDeletion } from "@/lib/services/channels";

import { verifySignedRequest } from "../_shared/signed-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Meta "Data deletion request URL". Must answer with `{ url, confirmation_code }`;
 * Meta shows both to the user. The status page is the public /data-deletion
 * page with the code in the query string.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const payload = await verifySignedRequest(req, "data_deletion");
  if (!payload) return NextResponse.json({ error: "Invalid signed_request", code: "INVALID_SIGNATURE" }, { status: 400 });

  try {
    const { confirmationCode } = await handleMetaDataDeletion(payload.userId);
    return NextResponse.json({
      url: appUrl(`/data-deletion?code=${encodeURIComponent(confirmationCode)}`),
      confirmation_code: confirmationCode,
    });
  } catch (err) {
    logger.error("meta.data_deletion_failed", { metaUserId: payload.userId, error: err });
    return NextResponse.json({ error: "Deletion could not be started", code: "INTERNAL" }, { status: 500 });
  }
}
