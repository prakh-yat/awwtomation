-- Bring-your-own-key AI: the provider the workspace pays for, and the agents
-- (prompt, rules, model settings) that reply with it.

CREATE TYPE "AiProviderKind" AS ENUM ('OPENAI_COMPATIBLE', 'ANTHROPIC', 'GOOGLE');
CREATE TYPE "AiProviderStatus" AS ENUM ('ACTIVE', 'INVALID_KEY', 'ERROR');

CREATE TABLE "AiProvider" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "AiProviderKind" NOT NULL,
    "apiKeyEnc" TEXT NOT NULL,
    "keyHint" TEXT NOT NULL,
    "baseUrl" TEXT,
    "model" TEXT NOT NULL,
    "status" "AiProviderStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastError" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiProvider_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiProvider_workspaceId_idx" ON "AiProvider"("workspaceId");

CREATE TABLE "AiAgent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "providerId" TEXT,
    "name" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "knowledge" TEXT,
    "guardrails" TEXT,
    "fallbackReply" TEXT,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
    "maxTokens" INTEGER NOT NULL DEFAULT 400,
    "historyLimit" INTEGER NOT NULL DEFAULT 20,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "repliesSent" INTEGER NOT NULL DEFAULT 0,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiAgent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiAgent_workspaceId_idx" ON "AiAgent"("workspaceId");
CREATE INDEX "AiAgent_providerId_idx" ON "AiAgent"("providerId");

ALTER TABLE "AiProvider" ADD CONSTRAINT "AiProvider_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiAgent" ADD CONSTRAINT "AiAgent_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiAgent" ADD CONSTRAINT "AiAgent_providerId_fkey"
    FOREIGN KEY ("providerId") REFERENCES "AiProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
