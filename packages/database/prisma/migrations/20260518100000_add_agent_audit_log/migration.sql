-- CreateTable
CREATE TABLE "agent_audit_log" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "endpoint_path" TEXT NOT NULL,
    "brand_id" TEXT,
    "version_id_returned" TEXT,
    "request_timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "response_status" INTEGER NOT NULL,

    CONSTRAINT "agent_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_audit_log_brand_timestamp_idx" ON "agent_audit_log"("brand_id", "request_timestamp" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "agent_audit_log_client_timestamp_idx" ON "agent_audit_log"("client_id", "request_timestamp" DESC);
