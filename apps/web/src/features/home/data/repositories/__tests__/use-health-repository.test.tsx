import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../remote/fetch-health", () => ({
  fetchHealth: vi.fn(),
}));

import { fetchHealth } from "../../remote/fetch-health";
import { useHealthRepository } from "../use-health-repository";

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("useHealthRepository", () => {
  beforeEach(() => {
    vi.mocked(fetchHealth).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps the fetched payload into a HealthStatus", async () => {
    vi.mocked(fetchHealth).mockResolvedValueOnce({
      status: "ok",
      timestamp: "2026-05-03T00:00:00Z",
      database: "connected",
    });

    const { result } = renderHook(() => useHealthRepository(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.isHealthy).toBe(true);
    expect(result.current.data?.databaseConnected).toBe(true);
  });

  it("surfaces query errors", async () => {
    vi.mocked(fetchHealth).mockRejectedValueOnce(new Error("boom"));

    const { result } = renderHook(() => useHealthRepository(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
