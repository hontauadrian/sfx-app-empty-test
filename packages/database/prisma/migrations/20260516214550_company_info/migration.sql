-- CreateTable
CREATE TABLE "company_info" (
    "id" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "trading_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "postal_code" TEXT,
    "country" TEXT,
    "tax_id" TEXT,
    "registration_number" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_info_pkey" PRIMARY KEY ("id")
);
