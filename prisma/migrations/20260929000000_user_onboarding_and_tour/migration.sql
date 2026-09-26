-- The welcome flow's questions about the person (role, how they heard about
-- us), kept on the user so a second workspace does not ask them again, and
-- when they were answered or skipped. Null for everyone who signed up before
-- the questions existed, so they are asked once on their next visit.
ALTER TABLE "User" ADD COLUMN "profileAnswers" JSONB;
ALTER TABLE "User" ADD COLUMN "profileCompletedAt" TIMESTAMP(3);

-- Which version of the product tour the person has been shown. 0 for everyone
-- today, so the new tour opens once for existing users too.
ALTER TABLE "User" ADD COLUMN "tourVersion" INTEGER NOT NULL DEFAULT 0;
