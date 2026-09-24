-- CreateTable
CREATE TABLE "McpToolAccess" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "userIds" TEXT[],
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpToolAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "McpToolAccess_organizationId_tool_key" ON "McpToolAccess"("organizationId", "tool");

-- AddForeignKey
ALTER TABLE "McpToolAccess" ADD CONSTRAINT "McpToolAccess_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

