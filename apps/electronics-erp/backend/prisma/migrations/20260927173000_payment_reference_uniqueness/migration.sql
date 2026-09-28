CREATE UNIQUE INDEX "Payment_tenantId_receivableId_reference_key"
ON "Payment"("tenantId", "receivableId", "reference");

CREATE UNIQUE INDEX "Payment_tenantId_payableId_reference_key"
ON "Payment"("tenantId", "payableId", "reference");
