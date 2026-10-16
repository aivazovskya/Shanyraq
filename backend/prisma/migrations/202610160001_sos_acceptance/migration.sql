ALTER TABLE "sos_alerts" ADD COLUMN "acceptedById" TEXT, ADD COLUMN "acceptedAt" TIMESTAMP(3);
ALTER TABLE "sos_alerts" ADD CONSTRAINT "sos_alerts_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
