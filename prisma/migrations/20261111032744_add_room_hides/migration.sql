-- CreateTable
CREATE TABLE "RoomHide" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomHide_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoomHide_userId_idx" ON "RoomHide"("userId");

-- CreateIndex
CREATE INDEX "RoomHide_roomId_idx" ON "RoomHide"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomHide_userId_roomId_key" ON "RoomHide"("userId", "roomId");

-- AddForeignKey
ALTER TABLE "RoomHide" ADD CONSTRAINT "RoomHide_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
