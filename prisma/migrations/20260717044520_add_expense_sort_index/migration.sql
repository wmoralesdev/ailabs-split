-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "sortIndex" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Expense_roomId_sortIndex_idx" ON "Expense"("roomId", "sortIndex");
