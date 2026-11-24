-- Additional indexes for filtered history and grouped transaction lookups.
CREATE INDEX IF NOT EXISTS "History_userId_createdAt_idx" ON "History"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "History_type_createdAt_idx" ON "History"("type", "createdAt");
CREATE INDEX IF NOT EXISTS "History_relatedId_idx" ON "History"("relatedId");
