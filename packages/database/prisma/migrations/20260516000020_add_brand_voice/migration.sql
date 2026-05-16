-- CreateTable
CREATE TABLE "brand_voice" (
    "id" TEXT NOT NULL,
    "brand_profile_id" TEXT NOT NULL,
    "tone_of_voice" TEXT,
    "preferred_vocabulary" JSONB NOT NULL DEFAULT '[]',
    "restricted_vocabulary" JSONB NOT NULL DEFAULT '[]',
    "messaging_pillars" JSONB NOT NULL DEFAULT '[]',
    "writing_style_rules" JSONB NOT NULL DEFAULT '[]',
    "audience_rules" JSONB NOT NULL DEFAULT '[]',
    "approved_example_phrases" JSONB NOT NULL DEFAULT '[]',
    "rejected_example_phrases" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_voice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "brand_voice_brand_profile_id_key" ON "brand_voice"("brand_profile_id");

-- AddForeignKey
ALTER TABLE "brand_voice" ADD CONSTRAINT "brand_voice_brand_profile_id_fkey" FOREIGN KEY ("brand_profile_id") REFERENCES "brand_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
