CREATE TABLE "BulkApprovalCode" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "createdByUsername" TEXT NOT NULL,
    "usedByUsername" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "BulkApprovalCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BulkApprovalCode_codeHash_key" ON "BulkApprovalCode"("codeHash");
CREATE INDEX "BulkApprovalCode_expiresAt_usedAt_idx" ON "BulkApprovalCode"("expiresAt", "usedAt");
CREATE INDEX "BulkApprovalCode_createdAt_idx" ON "BulkApprovalCode"("createdAt");
