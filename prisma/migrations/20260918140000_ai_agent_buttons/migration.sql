-- Link buttons an AI agent may attach to a reply, as [{ title, url }].
ALTER TABLE "AiAgent" ADD COLUMN "buttons" JSONB;
