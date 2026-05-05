import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/presentation/localization", () => ({
  useTranslations: vi.fn(),
}));

vi.mock("@/features/home/data/repositories/use-health-repository", () => ({
  useHealthRepository: vi.fn(),
}));

import { useTranslations } from "@/features/presentation/localization";
import { useHealthRepository } from "@/features/home/data/repositories/use-health-repository";
import { common as enCommon } from "@/features/presentation/localization/languages/en/common";
import { useHome } from "../use-home";

describe("useHome", () => {
  beforeEach(() => {
    vi.mocked(useTranslations).mockReturnValue(enCommon);
  });

  it("composes a uiModel from translations and the health query", () => {
    vi.mocked(useHealthRepository).mockReturnValue({
      data: { isHealthy: true, databaseConnected: true, checkedAt: new Date() },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useHealthRepository>);

    const { result } = renderHook(() => useHome());

    expect(result.current.uiModel.title).toBe(enCommon.appName);
    expect(result.current.uiModel.statusText).toBe(enCommon.connected);
    expect(result.current.uiModel.isHealthy).toBe(true);
  });

  it("surfaces loading state", () => {
    vi.mocked(useHealthRepository).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof useHealthRepository>);

    const { result } = renderHook(() => useHome());

    expect(result.current.uiModel.isLoading).toBe(true);
  });

  it("surfaces error state", () => {
    vi.mocked(useHealthRepository).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as unknown as ReturnType<typeof useHealthRepository>);

    const { result } = renderHook(() => useHome());

    expect(result.current.uiModel.isError).toBe(true);
  });
});
