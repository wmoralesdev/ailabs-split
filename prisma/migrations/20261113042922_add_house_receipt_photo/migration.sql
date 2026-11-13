-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "receiptBytes" BYTEA,
ADD COLUMN     "receiptMimeType" TEXT;
