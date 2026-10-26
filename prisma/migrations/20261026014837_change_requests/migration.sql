-- CreateTable
CREATE TABLE "change_requests" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resource_key" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "data" JSONB,
    "before" JSONB,
    "status" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,

    CONSTRAINT "change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "change_requests_resource_key_record_id_idx" ON "change_requests"("resource_key", "record_id");

-- One open request per record.
CREATE UNIQUE INDEX "change_requests_one_open_per_record" ON "change_requests"("resource_key", "record_id") WHERE "status" = 'requested';
