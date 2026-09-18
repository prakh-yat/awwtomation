-- Welcome questionnaire answers, stored on the workspace they describe.
ALTER TABLE "Workspace" ADD COLUMN "onboardingAnswers" JSONB;
ALTER TABLE "Workspace" ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);

-- Workspaces that already have a connected channel were set up before the
-- questionnaire existed; do not interrupt them with it now.
UPDATE "Workspace" SET "onboardingCompletedAt" = "onboardedAt" WHERE "onboardedAt" IS NOT NULL;
