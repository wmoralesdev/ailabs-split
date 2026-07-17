-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "fxAdjustmentBps" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "fxCalibrationSamples" JSONB;
