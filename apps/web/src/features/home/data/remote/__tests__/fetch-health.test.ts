import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchHealth } from "../fetch-health";

vi.mock("@/features/presentation/networking", () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from "@/features/presentation/networking";
import { HEALTH_ENDPOINT } from "@/features/home/constants";

describe("fetchHealth", () => {
  beforeEach(() => {
    vi.mocked(executeRequest).mockReset();
  });

  it("requests the health endpoint and returns the data payload", async () => {
    const payload = { status: "ok", timestamp: "2026-05-03T00:00:00Z", database: "ok" };
    vi.mocked(executeRequest).mockResolvedValueOnce({
      data: payload,
      success: true,
    } as unknown as Awaited<ReturnType<typeof executeRequest>>);

    const result = await fetchHealth();

    expect(executeRequest).toHaveBeenCalledWith({ path: HEALTH_ENDPOINT });
    expect(result).toEqual(payload);
  });

  it("propagates errors thrown by executeRequest", async () => {
    const error = new Error("network down");
    vi.mocked(executeRequest).mockRejectedValueOnce(error);

    await expect(fetchHealth()).rejects.toThrow("network down");
  });
});
