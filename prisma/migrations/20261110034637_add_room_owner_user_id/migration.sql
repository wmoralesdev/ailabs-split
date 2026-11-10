-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "ownerUserId" TEXT;

-- CreateIndex
CREATE INDEX "Room_ownerUserId_idx" ON "Room"("ownerUserId");
