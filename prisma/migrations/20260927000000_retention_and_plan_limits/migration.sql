-- AlterEnum
ALTER TYPE "DeliveryStatus" ADD VALUE 'SKIPPED_CONTACT_LIMIT';

-- CreateTable
CREATE TABLE "UsageMonthTotal" (
    "organizationId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "dmsSent" INTEGER NOT NULL,
    "privateReplies" INTEGER NOT NULL,
    "messages" INTEGER NOT NULL,
    "broadcasts" INTEGER NOT NULL,
    "publicReplies" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageMonthTotal_pkey" PRIMARY KEY ("organizationId","month")
);

-- CreateTable
CREATE TABLE "AutomationRecipient" (
    "automationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "firstSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationRecipient_pkey" PRIMARY KEY ("automationId","contactId")
);

-- CreateIndex
CREATE INDEX "AutomationRecipient_contactId_idx" ON "AutomationRecipient"("contactId");

-- CreateIndex
CREATE INDEX "FlowSession_workspaceId_createdAt_idx" ON "FlowSession"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "Contact_workspaceId_createdAt_idx" ON "Contact"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryLog_automationId_commentExternalId_idx" ON "DeliveryLog"("automationId", "commentExternalId");

-- CreateIndex
CREATE INDEX "DeliveryLog_broadcastId_contactId_idx" ON "DeliveryLog"("broadcastId", "contactId");

-- CreateIndex
CREATE INDEX "DeliveryLog_contactId_status_idx" ON "DeliveryLog"("contactId", "status");

-- CreateIndex
CREATE INDEX "LinkClick_contactId_idx" ON "LinkClick"("contactId");

-- AddForeignKey
ALTER TABLE "UsageMonthTotal" ADD CONSTRAINT "UsageMonthTotal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRecipient" ADD CONSTRAINT "AutomationRecipient_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRecipient" ADD CONSTRAINT "AutomationRecipient_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: everyone each automation has already reached, so "once per
-- contact" keeps holding after old delivery logs are deleted.
INSERT INTO "AutomationRecipient" ("automationId", "contactId", "firstSentAt")
SELECT d."automationId", d."contactId", MIN(d."createdAt")
FROM "DeliveryLog" d
JOIN "Automation" a ON a."id" = d."automationId"
JOIN "Contact" c ON c."id" = d."contactId"
WHERE d."status" = 'SENT' AND d."kind" <> 'PUBLIC_REPLY'
GROUP BY d."automationId", d."contactId"
ON CONFLICT DO NOTHING;
