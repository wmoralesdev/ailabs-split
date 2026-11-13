/*
  Warnings:

  - A unique constraint covering the columns `[roomId,userId]` on the table `Member` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "createdByMemberId" TEXT,
ADD COLUMN     "paidOn" DATE,
ADD COLUMN     "periodMonth" TEXT;

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "isGuest" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "joinedOn" DATE,
ADD COLUMN     "leftOn" DATE,
ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "Settlement" ADD COLUMN     "createdByMemberId" TEXT;

-- CreateTable
CREATE TABLE "RecurringTemplate" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amountCents" INTEGER,
    "dueDay" INTEGER NOT NULL,
    "paidById" TEXT NOT NULL,
    "splitMode" TEXT NOT NULL DEFAULT 'EQUAL',
    "startMonth" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdByMemberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurringTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringShare" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "weight" INTEGER,
    "amountCents" INTEGER,

    CONSTRAINT "RecurringShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringOccurrence" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "periodMonth" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "expenseId" TEXT,
    "createdByMemberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurringOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecurringTemplate_roomId_idx" ON "RecurringTemplate"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringShare_templateId_memberId_key" ON "RecurringShare"("templateId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringOccurrence_expenseId_key" ON "RecurringOccurrence"("expenseId");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringOccurrence_templateId_periodMonth_key" ON "RecurringOccurrence"("templateId", "periodMonth");

-- CreateIndex
CREATE INDEX "Expense_roomId_periodMonth_idx" ON "Expense"("roomId", "periodMonth");

-- CreateIndex
CREATE INDEX "Member_userId_idx" ON "Member"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Member_roomId_userId_key" ON "Member"("roomId", "userId");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdByMemberId_fkey" FOREIGN KEY ("createdByMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_createdByMemberId_fkey" FOREIGN KEY ("createdByMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTemplate" ADD CONSTRAINT "RecurringTemplate_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTemplate" ADD CONSTRAINT "RecurringTemplate_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringShare" ADD CONSTRAINT "RecurringShare_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "RecurringTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringShare" ADD CONSTRAINT "RecurringShare_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringOccurrence" ADD CONSTRAINT "RecurringOccurrence_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "RecurringTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringOccurrence" ADD CONSTRAINT "RecurringOccurrence_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
