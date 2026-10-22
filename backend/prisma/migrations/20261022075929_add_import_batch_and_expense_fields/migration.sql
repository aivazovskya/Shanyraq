-- CreateEnum
CREATE TYPE "ImportKind" AS ENUM ('EXPENSES', 'ONEC_PAYROLL', 'UK_DETAIL', 'ALSECO', 'BANK_STATEMENT', 'BUDGET');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PREVIEW', 'APPLIED', 'VOIDED');

-- CreateEnum
CREATE TYPE "ExpenseSource" AS ENUM ('MANUAL', 'IMPORT_EXCEL', 'IMPORT_1C', 'IMPORT_UK');

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "attachmentUrl" TEXT,
ADD COLUMN     "counterparty" TEXT,
ADD COLUMN     "documentNumber" TEXT,
ADD COLUMN     "importBatchId" TEXT,
ADD COLUMN     "periodMonth" INTEGER,
ADD COLUMN     "periodYear" INTEGER,
ADD COLUMN     "source" "ExpenseSource" NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "ImportKind" NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT,
    "status" "ImportStatus" NOT NULL DEFAULT 'PREVIEW',
    "rowsTotal" INTEGER NOT NULL DEFAULT 0,
    "rowsApplied" INTEGER NOT NULL DEFAULT 0,
    "rowsSkipped" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidedReason" TEXT,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
