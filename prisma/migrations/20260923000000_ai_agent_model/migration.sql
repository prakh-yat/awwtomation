-- The model an agent answers with. Null keeps using its provider's default model,
-- so existing agents behave exactly as before.
ALTER TABLE "AiAgent" ADD COLUMN "model" TEXT;
