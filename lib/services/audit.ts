import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export type AuditInput = {
  /** Null for organization-level events; put the organization id in `metadata` instead. */
  workspaceId?: string | null;
  userId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Prisma.InputJsonObject;
};

/**
 * Audit writes must never break the action they describe, so failures are
 * logged and swallowed. Call it *after* the transaction that made the change.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        workspaceId: input.workspaceId ?? null,
        userId: input.userId ?? null,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        metadata: input.metadata ?? Prisma.JsonNull,
      },
    });
  } catch (err) {
    logger.warn("audit.write_failed", { action: input.action, workspaceId: input.workspaceId, error: err });
  }
}
