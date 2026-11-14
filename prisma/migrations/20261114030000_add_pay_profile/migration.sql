-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "payAccount" TEXT,
ADD COLUMN     "payLabel" TEXT;

-- CreateTable
CREATE TABLE "PayProfile" (
    "userId" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "label" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayProfile_pkey" PRIMARY KEY ("userId")
);
