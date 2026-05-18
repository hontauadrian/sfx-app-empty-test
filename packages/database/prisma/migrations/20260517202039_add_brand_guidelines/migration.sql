-- CreateTable
CREATE TABLE "dos_donts_entry" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "rule_text" TEXT NOT NULL,
    "example_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dos_donts_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_metadata" (
    "brand_id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "last_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_updated_by_user_id" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_metadata_pkey" PRIMARY KEY ("brand_id")
);

-- CreateIndex
CREATE INDEX "dos_donts_brand_created_desc_idx" ON "dos_donts_entry"("brand_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "dos_donts_brand_type_category_idx" ON "dos_donts_entry"("brand_id", "type", "category");

-- AddForeignKey
ALTER TABLE "dos_donts_entry" ADD CONSTRAINT "dos_donts_entry_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_metadata" ADD CONSTRAINT "brand_metadata_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
