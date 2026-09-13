-- Organizations become the billable tenant above workspaces, and a workspace's
-- single stage list becomes any number of pipelines with coloured stages.
--
-- Existing data is carried across, not recreated:
-- - every workspace gets its own organization, using the workspace's id, so the
--   plan, subscription, DM counter, team, invitations and payments move over
--   unchanged and Dodo subscription metadata that names the old workspace id
--   still points at the right organization;
-- - every workspace gets a "Sales pipeline" built from its stage list, and every
--   contact is placed in it at the stage it had;
-- - saved segments that filtered by stage name now filter by that stage's id.

-- ───────────────────────── Organizations ─────────────────────────

CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" "PlanTier" NOT NULL DEFAULT 'FREE',
    "dmsSentThisPeriod" INTEGER NOT NULL DEFAULT 0,
    "usagePeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
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

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Organization" (
    "id", "name", "slug", "plan", "dmsSentThisPeriod", "usagePeriodStart", "planSource", "billingStatus",
    "billingInterval", "billingCustomerId", "billingSubscriptionId", "billingEmail", "currentPeriodEnd",
    "cancelAtPeriodEnd", "subscribedPlan", "createdAt", "updatedAt"
)
SELECT
    "id", "name", "slug", "plan", "dmsSentThisPeriod", "usagePeriodStart", "planSource", "billingStatus",
    "billingInterval", "billingCustomerId", "billingSubscriptionId", "billingEmail", "currentPeriodEnd",
    "cancelAtPeriodEnd", "subscribedPlan", "createdAt", "updatedAt"
FROM "Workspace";

ALTER TABLE "Workspace" ADD COLUMN "organizationId" TEXT;
UPDATE "Workspace" SET "organizationId" = "id";
ALTER TABLE "Workspace" ALTER COLUMN "organizationId" SET NOT NULL;

-- ───────────────────────── Members and invitations ─────────────────────────

CREATE TABLE "OrganizationMember" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

INSERT INTO "OrganizationMember" ("id", "organizationId", "userId", "role", "createdAt")
SELECT "id", "workspaceId", "userId", "role", "createdAt" FROM "WorkspaceMember";

CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
    "token" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Invitation" ("id", "organizationId", "email", "role", "token", "status", "invitedById", "expiresAt", "createdAt")
SELECT "id", "workspaceId", "email", "role", "token", "status", "invitedById", "expiresAt", "createdAt" FROM "WorkspaceInvitation";

-- ───────────────────────── Payments ─────────────────────────

ALTER TABLE "Payment" ADD COLUMN "organizationId" TEXT;
UPDATE "Payment" SET "organizationId" = "workspaceId";
ALTER TABLE "Payment" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_workspaceId_fkey";
DROP INDEX "Payment_workspaceId_createdAt_idx";
ALTER TABLE "Payment" DROP COLUMN "workspaceId";

-- ───────────────────────── Pipelines ─────────────────────────

CREATE TABLE "Pipeline" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pipeline_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PipelineStage" (
    "id" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'gray',
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineStage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PipelineEntry" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineEntry_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Pipeline" ("id", "workspaceId", "name", "position", "createdAt", "updatedAt")
SELECT 'pl_' || "id", "id", 'Sales pipeline', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "Workspace";

-- Stages in the workspace's stored order. Known default names get their usual
-- colours; anything custom takes the next colour from the palette.
INSERT INTO "PipelineStage" ("id", "pipelineId", "name", "color", "position", "createdAt", "updatedAt")
SELECT
    'ps_' || w."id" || '_' || (s.ord - 1),
    'pl_' || w."id",
    s.name,
    CASE lower(s.name)
        WHEN 'new' THEN 'gray'
        WHEN 'engaged' THEN 'blue'
        WHEN 'lead' THEN 'violet'
        WHEN 'customer' THEN 'green'
        WHEN 'lost' THEN 'red'
        ELSE (ARRAY['gray', 'blue', 'violet', 'amber', 'green', 'red', 'pink', 'teal'])[((s.ord - 1) % 8) + 1]
    END,
    s.ord - 1,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Workspace" w
CROSS JOIN LATERAL (
    SELECT DISTINCT ON (lower(trim(e.value))) trim(e.value) AS name, e.ord
    FROM jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(w."pipelineStages"::jsonb) = 'array' THEN w."pipelineStages"::jsonb ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS e(value, ord)
    WHERE trim(e.value) <> ''
    ORDER BY lower(trim(e.value)), e.ord
) s;

-- A workspace whose stored list was empty or unreadable gets the default stages.
INSERT INTO "PipelineStage" ("id", "pipelineId", "name", "color", "position", "createdAt", "updatedAt")
SELECT 'ps_' || w."id" || '_' || d.position, 'pl_' || w."id", d.name, d.color, d.position, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Workspace" w
CROSS JOIN (
    VALUES ('New', 'gray', 0), ('Engaged', 'blue', 1), ('Lead', 'violet', 2), ('Customer', 'green', 3), ('Lost', 'red', 4)
) AS d(name, color, position)
WHERE NOT EXISTS (SELECT 1 FROM "PipelineStage" st WHERE st."pipelineId" = 'pl_' || w."id");

-- Positions may have gaps after de-duplication; renumber them 0..n-1.
UPDATE "PipelineStage" st
SET "position" = ranked.rn - 1
FROM (
    SELECT "id", row_number() OVER (PARTITION BY "pipelineId" ORDER BY "position") AS rn FROM "PipelineStage"
) ranked
WHERE ranked."id" = st."id";

-- Every contact keeps the stage it had; a stage name that no longer exists falls to the first stage.
INSERT INTO "PipelineEntry" ("id", "workspaceId", "pipelineId", "stageId", "contactId", "createdAt", "updatedAt")
SELECT
    'pe_' || c."id",
    c."workspaceId",
    'pl_' || c."workspaceId",
    COALESCE(
        (SELECT st."id" FROM "PipelineStage" st WHERE st."pipelineId" = 'pl_' || c."workspaceId" AND lower(st."name") = lower(c."stage") LIMIT 1),
        (SELECT st."id" FROM "PipelineStage" st WHERE st."pipelineId" = 'pl_' || c."workspaceId" ORDER BY st."position" LIMIT 1)
    ),
    c."id",
    c."createdAt",
    c."updatedAt"
FROM "Contact" c;

-- Saved segments: a stage name becomes the matching stage in the new pipeline.
UPDATE "Segment" sg
SET "filters" = (sg."filters"::jsonb - 'stage') || jsonb_build_object('pipelineId', st."pipelineId", 'stageId', st."id")
FROM "PipelineStage" st
WHERE st."pipelineId" = 'pl_' || sg."workspaceId"
  AND sg."filters"::jsonb ? 'stage'
  AND lower(st."name") = lower(sg."filters"::jsonb ->> 'stage');

UPDATE "Segment" SET "filters" = "filters"::jsonb - 'stage' WHERE "filters"::jsonb ? 'stage';

-- ───────────────────────── Drop what moved ─────────────────────────

DROP INDEX "Contact_workspaceId_stage_idx";
ALTER TABLE "Contact" DROP COLUMN "stage";

DROP INDEX "Workspace_billingSubscriptionId_key";
ALTER TABLE "Workspace" DROP COLUMN "billingCustomerId",
DROP COLUMN "billingEmail",
DROP COLUMN "billingInterval",
DROP COLUMN "billingStatus",
DROP COLUMN "billingSubscriptionId",
DROP COLUMN "cancelAtPeriodEnd",
DROP COLUMN "currentPeriodEnd",
DROP COLUMN "dmsSentThisPeriod",
DROP COLUMN "pipelineStages",
DROP COLUMN "plan",
DROP COLUMN "planSource",
DROP COLUMN "subscribedPlan",
DROP COLUMN "usagePeriodStart";

DROP TABLE "WorkspaceInvitation";
DROP TABLE "WorkspaceMember";

-- ───────────────────────── Indexes and keys ─────────────────────────

CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
CREATE UNIQUE INDEX "Organization_billingSubscriptionId_key" ON "Organization"("billingSubscriptionId");
CREATE INDEX "OrganizationMember_userId_idx" ON "OrganizationMember"("userId");
CREATE UNIQUE INDEX "OrganizationMember_organizationId_userId_key" ON "OrganizationMember"("organizationId", "userId");
CREATE UNIQUE INDEX "Invitation_token_key" ON "Invitation"("token");
CREATE INDEX "Invitation_organizationId_idx" ON "Invitation"("organizationId");
CREATE INDEX "Invitation_email_idx" ON "Invitation"("email");
CREATE INDEX "Pipeline_workspaceId_position_idx" ON "Pipeline"("workspaceId", "position");
CREATE UNIQUE INDEX "Pipeline_workspaceId_name_key" ON "Pipeline"("workspaceId", "name");
CREATE INDEX "PipelineStage_pipelineId_position_idx" ON "PipelineStage"("pipelineId", "position");
CREATE UNIQUE INDEX "PipelineStage_pipelineId_name_key" ON "PipelineStage"("pipelineId", "name");
CREATE INDEX "PipelineEntry_workspaceId_stageId_idx" ON "PipelineEntry"("workspaceId", "stageId");
CREATE INDEX "PipelineEntry_contactId_idx" ON "PipelineEntry"("contactId");
CREATE UNIQUE INDEX "PipelineEntry_pipelineId_contactId_key" ON "PipelineEntry"("pipelineId", "contactId");
CREATE INDEX "Payment_organizationId_createdAt_idx" ON "Payment"("organizationId", "createdAt");
CREATE INDEX "Workspace_organizationId_idx" ON "Workspace"("organizationId");

ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Pipeline" ADD CONSTRAINT "Pipeline_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PipelineStage" ADD CONSTRAINT "PipelineStage_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PipelineEntry" ADD CONSTRAINT "PipelineEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PipelineEntry" ADD CONSTRAINT "PipelineEntry_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PipelineEntry" ADD CONSTRAINT "PipelineEntry_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "PipelineStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PipelineEntry" ADD CONSTRAINT "PipelineEntry_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
