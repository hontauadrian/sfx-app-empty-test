-- CreateTable
CREATE TABLE "visual_identity" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "logo_usage_rules" TEXT,
    "colour_palette" JSONB NOT NULL DEFAULT '[]',
    "typography_rules" JSONB NOT NULL DEFAULT '[]',
    "spacing_layout_guidance" TEXT,
    "image_style_guidance" TEXT,
    "iconography_guidance" TEXT,
    "usage_restrictions" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visual_identity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "visual_identity_brand_id_key" ON "visual_identity"("brand_id");

-- AddForeignKey
ALTER TABLE "visual_identity" ADD CONSTRAINT "visual_identity_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brand_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
