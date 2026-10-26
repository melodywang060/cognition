-- CreateTable
CREATE TABLE "feature_flags" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "environment" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "rollout_pct" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "feature_flags_name_environment_key" ON "feature_flags"("name", "environment");

-- Defence in depth: the app config validates these too.
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_environment_check" CHECK ("environment" IN ('dev', 'staging', 'prod'));
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_rollout_pct_check" CHECK ("rollout_pct" BETWEEN 0 AND 100);
