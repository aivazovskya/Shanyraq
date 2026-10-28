-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- AlterTable
ALTER TABLE "unit_ownerships" ADD COLUMN "leaseEndDate" TIMESTAMP(3),
ADD COLUMN "invitedById" TEXT;

-- CreateTable
CREATE TABLE "unit_invitations" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "fullName" TEXT,
    "ownershipType" "OwnershipType" NOT NULL DEFAULT 'TENANT',
    "leaseEndDate" TIMESTAMP(3),
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "unit_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "unit_ownerships_unitId_isVerified_idx" ON "unit_ownerships"("unitId", "isVerified");

-- CreateIndex
CREATE INDEX "unit_invitations_phone_status_idx" ON "unit_invitations"("phone", "status");

-- CreateIndex
CREATE INDEX "unit_invitations_unitId_status_idx" ON "unit_invitations"("unitId", "status");

-- AddForeignKey
ALTER TABLE "unit_ownerships" ADD CONSTRAINT "unit_ownerships_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_invitations" ADD CONSTRAINT "unit_invitations_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_invitations" ADD CONSTRAINT "unit_invitations_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
