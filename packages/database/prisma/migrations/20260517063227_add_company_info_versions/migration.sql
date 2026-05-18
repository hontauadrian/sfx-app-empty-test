-- CreateTable
CREATE TABLE "company_info_version" (
    "id" TEXT NOT NULL,
    "company_info_id" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "editor_user_id" TEXT NOT NULL,
    "editor_display_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_info_version_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "company_info_version_company_created_idx" ON "company_info_version"("company_info_id", "created_at" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "company_info_version" ADD CONSTRAINT "company_info_version_company_info_id_fkey" FOREIGN KEY ("company_info_id") REFERENCES "company_info"("id") ON DELETE CASCADE ON UPDATE CASCADE;
