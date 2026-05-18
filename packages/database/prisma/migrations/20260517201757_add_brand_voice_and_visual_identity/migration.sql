-- CreateTable
CREATE TABLE "brand_voice" (
    "brand_id" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "preferred_vocabulary" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "restricted_vocabulary" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "messaging_pillars" JSONB NOT NULL DEFAULT '[]',
    "writing_style_rules" TEXT NOT NULL DEFAULT '',
    "audience_rules" JSONB NOT NULL DEFAULT '[]',
    "approved_examples" JSONB NOT NULL DEFAULT '[]',
    "rejected_examples" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_voice_pkey" PRIMARY KEY ("brand_id")
);

-- CreateTable
CREATE TABLE "visual_identity" (
    "brand_id" TEXT NOT NULL,
    "logo_usage" TEXT NOT NULL,
    "color_palette" JSONB NOT NULL DEFAULT '[]',
    "typography" JSONB NOT NULL DEFAULT '[]',
    "spacing_guidance" TEXT NOT NULL DEFAULT '',
    "image_style_guidance" TEXT NOT NULL DEFAULT '',
    "iconography_guidance" TEXT NOT NULL DEFAULT '',
    "usage_restrictions" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visual_identity_pkey" PRIMARY KEY ("brand_id")
);

-- AddForeignKey
ALTER TABLE "brand_voice" ADD CONSTRAINT "brand_voice_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visual_identity" ADD CONSTRAINT "visual_identity_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
