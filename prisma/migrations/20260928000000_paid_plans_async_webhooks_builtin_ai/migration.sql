-- There is no free plan any more. Organizations without a subscription keep
-- their data and can set things up, but send nothing until they pay. The value
-- is renamed in place, so every existing FREE row becomes NONE.
ALTER TYPE "PlanTier" RENAME VALUE 'FREE' TO 'NONE';
ALTER TABLE "Organization" ALTER COLUMN "plan" SET DEFAULT 'NONE';

-- AlterEnum
ALTER TYPE "JobType" ADD VALUE 'PROCESS_WEBHOOK';
ALTER TYPE "JobType" ADD VALUE 'BROADCAST_FANOUT';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "tourCompletedAt" TIMESTAMP(3);

-- The product tour starts once for people who sign up from now on; everyone
-- already using the app can open it from the account menu.
UPDATE "User" SET "tourCompletedAt" = NOW() WHERE "tourCompletedAt" IS NULL;

-- AlterTable
ALTER TABLE "Channel" ADD COLUMN     "alertSentAt" TIMESTAMP(3),
ADD COLUMN     "pollBackoffUntil" TIMESTAMP(3),
ADD COLUMN     "setupAnswers" JSONB,
ADD COLUMN     "setupCompletedAt" TIMESTAMP(3);

-- Accounts connected before connect-time questions existed are not asked them.
UPDATE "Channel" SET "setupCompletedAt" = "createdAt" WHERE "setupCompletedAt" IS NULL;

-- AlterTable
ALTER TABLE "Broadcast" ADD COLUMN     "fanoutCompletedAt" TIMESTAMP(3);

-- Broadcasts already past the audience step were queued in one go.
UPDATE "Broadcast" SET "fanoutCompletedAt" = COALESCE("startedAt", "updatedAt") WHERE "status" <> 'DRAFT' AND "status" <> 'SCHEDULED';

-- AlterTable
ALTER TABLE "WebhookEvent" ADD COLUMN     "claimedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "RequestRateLimit" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RequestRateLimit_pkey" PRIMARY KEY ("key","windowStart")
);

-- CreateIndex
CREATE INDEX "RequestRateLimit_windowStart_idx" ON "RequestRateLimit"("windowStart");

-- CreateIndex
CREATE INDEX "FlowSession_status_updatedAt_idx" ON "FlowSession"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "LinkClick_linkId_ipHash_createdAt_idx" ON "LinkClick"("linkId", "ipHash", "createdAt");

-- CreateIndex
CREATE INDEX "WebhookEvent_processed_createdAt_idx" ON "WebhookEvent"("processed", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_workspaceId_action_createdAt_idx" ON "AuditLog"("workspaceId", "action", "createdAt");

-- An agent without a connection of its own used to reply through the
-- workspace's default connection. A null connection now means the built-in
-- model, so pin those agents to the connection they were already using.
UPDATE "AiAgent" a
SET "providerId" = p."id"
FROM "AiProvider" p
WHERE a."providerId" IS NULL
  AND p."workspaceId" = a."workspaceId"
  AND p."isDefault" = true;
