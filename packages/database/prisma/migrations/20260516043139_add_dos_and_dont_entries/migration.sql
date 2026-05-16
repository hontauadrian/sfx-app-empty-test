-- CreateTable
CREATE TABLE "dos_and_dont_entries" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "suggested_correction" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dos_and_dont_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dos_and_dont_entries_brand_id_idx" ON "dos_and_dont_entries"("brand_id");

-- CreateIndex
CREATE INDEX "dos_and_dont_entries_brand_id_category_idx" ON "dos_and_dont_entries"("brand_id", "category");

-- AddForeignKey
ALTER TABLE "dos_and_dont_entries" ADD CONSTRAINT "dos_and_dont_entries_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brand_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
