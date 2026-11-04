-- DropIndex
DROP INDEX "inspection_items_inspectionId_idx";

-- AlterTable
ALTER TABLE "inspection_items" ADD COLUMN     "position" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "inspection_items_inspectionId_position_key" ON "inspection_items"("inspectionId", "position");

