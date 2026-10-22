-- CreateIndex
CREATE INDEX "expenses_importBatchId_idx" ON "expenses"("importBatchId");

-- CreateIndex
CREATE INDEX "import_batches_tenantId_createdAt_idx" ON "import_batches"("tenantId", "createdAt");
