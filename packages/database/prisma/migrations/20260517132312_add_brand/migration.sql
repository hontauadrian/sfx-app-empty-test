-- CreateTable
CREATE TABLE "brand" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "brand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "brand_deleted_at_idx" ON "brand"("deleted_at");

-- CreateIndex
CREATE INDEX "brand_created_desc_idx" ON "brand"("created_at" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "brand_slug_uniq" ON "brand"("slug");
