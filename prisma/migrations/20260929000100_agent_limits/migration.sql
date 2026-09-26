-- Agents reply within tighter limits (lib/ai/limits.ts): up to 400 tokens and
-- 20 messages of context, and a new agent starts at half of each, with low
-- creativity, because a business's DMs want its facts.
ALTER TABLE "AiAgent" ALTER COLUMN "maxTokens" SET DEFAULT 200;
ALTER TABLE "AiAgent" ALTER COLUMN "historyLimit" SET DEFAULT 10;
ALTER TABLE "AiAgent" ALTER COLUMN "temperature" SET DEFAULT 0.4;

-- Agents saved before the limits keep working and can be saved again as they are.
UPDATE "AiAgent" SET "maxTokens" = 400 WHERE "maxTokens" > 400;
UPDATE "AiAgent" SET "historyLimit" = 20 WHERE "historyLimit" > 20;
