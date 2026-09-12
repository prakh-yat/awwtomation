-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('FREE', 'STARTER', 'PRO', 'AGENCY');

-- CreateEnum
CREATE TYPE "ChannelPlatform" AS ENUM ('INSTAGRAM', 'FACEBOOK');

-- CreateEnum
CREATE TYPE "ChannelStatus" AS ENUM ('ACTIVE', 'TOKEN_EXPIRED', 'DISCONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "AutomationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "TriggerType" AS ENUM ('COMMENT', 'DM', 'STORY_REPLY');

-- CreateEnum
CREATE TYPE "MatchMode" AS ENUM ('CONTAINS', 'EXACT', 'ANY');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('EXECUTE_FLOW', 'PUBLIC_REPLY', 'BROADCAST_SEND', 'REFRESH_TOKEN', 'RECONCILE_COMMENTS', 'SYNC_MEDIA');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED_DUPLICATE', 'SKIPPED_RATE_LIMIT', 'SKIPPED_SELF', 'SKIPPED_NOT_FOLLOWING', 'SKIPPED_WINDOW', 'SKIPPED_PLAN_LIMIT', 'SKIPPED_OPTED_OUT');

-- CreateEnum
CREATE TYPE "DeliveryKind" AS ENUM ('PRIVATE_REPLY', 'MESSAGE', 'PUBLIC_REPLY', 'BROADCAST');

-- CreateEnum
CREATE TYPE "ContactSource" AS ENUM ('WEBHOOK', 'IMPORT', 'MANUAL');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "BroadcastStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('NONE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'ON_HOLD', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "PlanSource" AS ENUM ('DEFAULT', 'SUBSCRIPTION', 'ADMIN_OVERRIDE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "FlowSessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'EXPIRED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "supabaseId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "avatarUrl" TEXT,
    "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" "PlanTier" NOT NULL DEFAULT 'FREE',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kathmandu',
    "dmsSentThisPeriod" INTEGER NOT NULL DEFAULT 0,
    "usagePeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "onboardedAt" TIMESTAMP(3),
    "pipelineStages" JSONB NOT NULL DEFAULT '["New","Engaged","Lead","Customer","Lost"]',
    "planSource" "PlanSource" NOT NULL DEFAULT 'DEFAULT',
    "billingStatus" "BillingStatus" NOT NULL DEFAULT 'NONE',
    "billingInterval" "BillingInterval",
    "billingCustomerId" TEXT,
    "billingSubscriptionId" TEXT,
    "billingEmail" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "subscribedPlan" "PlanTier",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMember" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceInvitation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
    "token" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "platform" "ChannelPlatform" NOT NULL,
    "externalId" TEXT NOT NULL,
    "username" TEXT,
    "name" TEXT,
    "avatarUrl" TEXT,
    "accessTokenEnc" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3),
    "linkedInstagramId" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ChannelStatus" NOT NULL DEFAULT 'ACTIVE',
    "webhookSubscribed" BOOLEAN NOT NULL DEFAULT false,
    "followerCount" INTEGER,
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "connectedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "caption" TEXT,
    "mediaType" TEXT,
    "mediaUrl" TEXT,
    "thumbnailUrl" TEXT,
    "permalink" TEXT,
    "timestamp" TIMESTAMP(3),
    "commentCount" INTEGER,
    "likeCount" INTEGER,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Automation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "AutomationStatus" NOT NULL DEFAULT 'DRAFT',
    "triggerType" "TriggerType" NOT NULL DEFAULT 'COMMENT',
    "matchMode" "MatchMode" NOT NULL DEFAULT 'CONTAINS',
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludeKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mediaIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "flow" JSONB NOT NULL,
    "publicReplyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "publicReplies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "oncePerContact" BOOLEAN NOT NULL DEFAULT true,
    "triggeredCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "lastTriggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Automation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowSession" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "currentNodeId" TEXT,
    "status" "FlowSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "context" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlowSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "platform" "ChannelPlatform" NOT NULL,
    "externalId" TEXT NOT NULL,
    "username" TEXT,
    "name" TEXT,
    "avatarUrl" TEXT,
    "isFollower" BOOLEAN,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "customFields" JSONB NOT NULL DEFAULT '{}',
    "optedOut" BOOLEAN NOT NULL DEFAULT false,
    "source" "ContactSource" NOT NULL DEFAULT 'WEBHOOK',
    "messageable" BOOLEAN NOT NULL DEFAULT true,
    "email" TEXT,
    "phone" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'New',
    "ownerId" TEXT,
    "lastContactedAt" TIMESTAMP(3),
    "notesCount" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastInteractionAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactNote" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "externalId" TEXT,
    "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
    "lastInboundAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3),
    "lastMessagePreview" TEXT,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "assignedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "externalId" TEXT,
    "text" TEXT,
    "payload" JSONB,
    "sentByUserId" TEXT,
    "automationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Broadcast" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "message" JSONB NOT NULL,
    "audience" JSONB NOT NULL DEFAULT '{}',
    "status" "BroadcastStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "targetCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'dodo',
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'dodo',
    "externalId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "PaymentStatus" NOT NULL,
    "description" TEXT,
    "invoiceUrl" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Segment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Segment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "automationId" TEXT,
    "broadcastId" TEXT,
    "contactId" TEXT,
    "kind" "DeliveryKind" NOT NULL,
    "status" "DeliveryStatus" NOT NULL,
    "commentExternalId" TEXT,
    "recipientExternalId" TEXT,
    "recipientUsername" TEXT,
    "messagePreview" TEXT,
    "errorMessage" TEXT,
    "metaResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackedLink" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "automationId" TEXT,
    "broadcastId" TEXT,
    "slug" TEXT NOT NULL,
    "label" TEXT,
    "destinationUrl" TEXT NOT NULL,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackedLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkClick" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "contactId" TEXT,
    "userAgent" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinkClick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "platform" "ChannelPlatform" NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "field" TEXT,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitWindow" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "bucket" TEXT NOT NULL DEFAULT 'private_reply',
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RateLimitWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "type" "JobType" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lastError" TEXT,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_supabaseId_key" ON "User"("supabaseId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_billingSubscriptionId_key" ON "Workspace"("billingSubscriptionId");

-- CreateIndex
CREATE INDEX "WorkspaceMember_userId_idx" ON "WorkspaceMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_userId_key" ON "WorkspaceMember"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceInvitation_token_key" ON "WorkspaceInvitation"("token");

-- CreateIndex
CREATE INDEX "WorkspaceInvitation_workspaceId_idx" ON "WorkspaceInvitation"("workspaceId");

-- CreateIndex
CREATE INDEX "WorkspaceInvitation_email_idx" ON "WorkspaceInvitation"("email");

-- CreateIndex
CREATE INDEX "Channel_workspaceId_idx" ON "Channel"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_platform_externalId_key" ON "Channel"("platform", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Media_channelId_externalId_key" ON "Media"("channelId", "externalId");

-- CreateIndex
CREATE INDEX "Automation_workspaceId_idx" ON "Automation"("workspaceId");

-- CreateIndex
CREATE INDEX "Automation_channelId_status_idx" ON "Automation"("channelId", "status");

-- CreateIndex
CREATE INDEX "FlowSession_contactId_status_idx" ON "FlowSession"("contactId", "status");

-- CreateIndex
CREATE INDEX "FlowSession_automationId_idx" ON "FlowSession"("automationId");

-- CreateIndex
CREATE INDEX "Contact_workspaceId_lastInteractionAt_idx" ON "Contact"("workspaceId", "lastInteractionAt");

-- CreateIndex
CREATE INDEX "Contact_workspaceId_stage_idx" ON "Contact"("workspaceId", "stage");

-- CreateIndex
CREATE INDEX "Contact_workspaceId_ownerId_idx" ON "Contact"("workspaceId", "ownerId");

-- CreateIndex
CREATE INDEX "Contact_workspaceId_email_idx" ON "Contact"("workspaceId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_channelId_externalId_key" ON "Contact"("channelId", "externalId");

-- CreateIndex
CREATE INDEX "ContactNote_contactId_createdAt_idx" ON "ContactNote"("contactId", "createdAt");

-- CreateIndex
CREATE INDEX "ContactNote_workspaceId_idx" ON "ContactNote"("workspaceId");

-- CreateIndex
CREATE INDEX "Conversation_workspaceId_lastMessageAt_idx" ON "Conversation"("workspaceId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_channelId_contactId_key" ON "Conversation"("channelId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_externalId_key" ON "Message"("externalId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Broadcast_workspaceId_idx" ON "Broadcast"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingEvent_eventId_key" ON "BillingEvent"("eventId");

-- CreateIndex
CREATE INDEX "BillingEvent_createdAt_idx" ON "BillingEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_externalId_key" ON "Payment"("externalId");

-- CreateIndex
CREATE INDEX "Payment_workspaceId_createdAt_idx" ON "Payment"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "Segment_workspaceId_idx" ON "Segment"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Segment_workspaceId_name_key" ON "Segment"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "DeliveryLog_workspaceId_createdAt_idx" ON "DeliveryLog"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryLog_automationId_createdAt_idx" ON "DeliveryLog"("automationId", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryLog_channelId_commentExternalId_idx" ON "DeliveryLog"("channelId", "commentExternalId");

-- CreateIndex
CREATE UNIQUE INDEX "TrackedLink_slug_key" ON "TrackedLink"("slug");

-- CreateIndex
CREATE INDEX "TrackedLink_workspaceId_idx" ON "TrackedLink"("workspaceId");

-- CreateIndex
CREATE INDEX "LinkClick_linkId_createdAt_idx" ON "LinkClick"("linkId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_dedupeKey_key" ON "WebhookEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "WebhookEvent_createdAt_idx" ON "WebhookEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimitWindow_channelId_bucket_windowStart_key" ON "RateLimitWindow"("channelId", "bucket", "windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "Job_dedupeKey_key" ON "Job"("dedupeKey");

-- CreateIndex
CREATE INDEX "Job_status_runAt_idx" ON "Job"("status", "runAt");

-- CreateIndex
CREATE INDEX "Job_workspaceId_createdAt_idx" ON "Job"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_workspaceId_createdAt_idx" ON "AuditLog"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceInvitation" ADD CONSTRAINT "WorkspaceInvitation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceInvitation" ADD CONSTRAINT "WorkspaceInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_connectedById_fkey" FOREIGN KEY ("connectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowSession" ADD CONSTRAINT "FlowSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowSession" ADD CONSTRAINT "FlowSession_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowSession" ADD CONSTRAINT "FlowSession_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactNote" ADD CONSTRAINT "ContactNote_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactNote" ADD CONSTRAINT "ContactNote_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactNote" ADD CONSTRAINT "ContactNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_sentByUserId_fkey" FOREIGN KEY ("sentByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Segment" ADD CONSTRAINT "Segment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryLog" ADD CONSTRAINT "DeliveryLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryLog" ADD CONSTRAINT "DeliveryLog_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryLog" ADD CONSTRAINT "DeliveryLog_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryLog" ADD CONSTRAINT "DeliveryLog_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "Broadcast"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryLog" ADD CONSTRAINT "DeliveryLog_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackedLink" ADD CONSTRAINT "TrackedLink_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackedLink" ADD CONSTRAINT "TrackedLink_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackedLink" ADD CONSTRAINT "TrackedLink_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "Broadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkClick" ADD CONSTRAINT "LinkClick_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "TrackedLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkClick" ADD CONSTRAINT "LinkClick_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateLimitWindow" ADD CONSTRAINT "RateLimitWindow_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

