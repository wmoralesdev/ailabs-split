-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "currency" TEXT,
ADD COLUMN     "splitMode" TEXT NOT NULL DEFAULT 'EQUAL';

-- AlterTable
ALTER TABLE "ExpenseShare" ADD COLUMN     "weight" INTEGER;

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "currencies" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "fxRates" JSONB;
