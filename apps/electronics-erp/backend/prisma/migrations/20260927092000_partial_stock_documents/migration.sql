-- DropIndex
DROP INDEX "StockMovement_tenantId_sourceType_sourceId_productId_key";

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "reorderPoint" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PurchaseLine" ADD COLUMN     "receivedQty" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SalesLine" ADD COLUMN     "shippedQty" INTEGER NOT NULL DEFAULT 0;

-- Existing completed documents were fully processed before partial fulfillment was introduced.
UPDATE "PurchaseLine" SET "receivedQty" = "quantity"
WHERE "orderId" IN (SELECT "id" FROM "PurchaseOrder" WHERE "status" = 'received');
UPDATE "SalesLine" SET "shippedQty" = "quantity"
WHERE "contractId" IN (SELECT "id" FROM "SalesContract" WHERE "status" = 'shipped');

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "documentId" TEXT;

-- CreateTable
CREATE TABLE "StockDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "note" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockDocument_tenantId_kind_sourceId_createdAt_idx" ON "StockDocument"("tenantId", "kind", "sourceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockDocument_tenantId_number_key" ON "StockDocument"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_tenantId_documentId_productId_key" ON "StockMovement"("tenantId", "documentId", "productId");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "StockDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockDocument" ADD CONSTRAINT "StockDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
