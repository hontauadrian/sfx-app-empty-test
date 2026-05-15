-- CreateTable
CREATE TABLE "brand_profile" (
    "id" TEXT NOT NULL,
    "owner_subject" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_profile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "brand_profile_owner_subject_idx" ON "brand_profile"("owner_subject");
