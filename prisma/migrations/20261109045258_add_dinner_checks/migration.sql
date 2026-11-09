-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'TRIP';

-- CreateTable
CREATE TABLE "Check" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "expenseId" TEXT,
    "merchant" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "paidById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "isPrecuenta" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Check_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Check_expenseId_key" ON "Check"("expenseId");

-- CreateIndex
CREATE INDEX "Check_roomId_idx" ON "Check"("roomId");

-- CreateIndex
CREATE INDEX "Check_paidById_idx" ON "Check"("paidById");

-- AddForeignKey
ALTER TABLE "Check" ADD CONSTRAINT "Check_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Check" ADD CONSTRAINT "Check_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Check" ADD CONSTRAINT "Check_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
