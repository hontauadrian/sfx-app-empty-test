-- AlterTable
ALTER TABLE "company_info" ADD COLUMN     "certifications" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "company_name" TEXT,
ADD COLUMN     "core_values" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "founded_year" INTEGER,
ADD COLUMN     "industry" TEXT,
ADD COLUMN     "mission_statement" TEXT,
ADD COLUMN     "team_size" INTEGER,
ADD COLUMN     "vision_statement" TEXT;
