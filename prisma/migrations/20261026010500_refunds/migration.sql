-- CreateTable
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customer" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "reason_code" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "refunds_status_idx" ON "refunds"("status");
