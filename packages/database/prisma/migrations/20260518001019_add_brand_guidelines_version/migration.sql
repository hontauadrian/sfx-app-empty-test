-- CreateTable
CREATE TABLE "brand_guidelines_version" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "editor_user_id" TEXT NOT NULL,
    "editor_display_name" TEXT NOT NULL,
    "change_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brand_guidelines_version_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "brand_guidelines_version_brand_created_desc_idx" ON "brand_guidelines_version"("brand_id", "created_at" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "brand_guidelines_version" ADD CONSTRAINT "brand_guidelines_version_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
