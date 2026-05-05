import { act, render, renderHook } from "@testing-library/react";
import { useContext, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LanguageContext, LanguageProvider } from "../language-provider";

function wrapper({ children }: { children: ReactNode }): ReactNode {
  return <LanguageProvider>{children}</LanguageProvider>;
}

describe("LanguageProvider", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("provides the default language ('en') when no defaultLanguage is given", () => {
    const { result } = renderHook(() => useContext(LanguageContext), { wrapper });
    expect(result.current?.language).toBe("en");
  });

  it("respects an explicit defaultLanguage prop", () => {
    function customWrapper({ children }: { children: ReactNode }): ReactNode {
      return <LanguageProvider defaultLanguage="ro">{children}</LanguageProvider>;
    }
    const { result } = renderHook(() => useContext(LanguageContext), { wrapper: customWrapper });
    expect(result.current?.language).toBe("ro");
  });

  it("updates context state and localStorage when setLanguage is called", () => {
    const { result } = renderHook(() => useContext(LanguageContext), { wrapper });
    act(() => {
      result.current?.setLanguage("ro");
    });
    expect(result.current?.language).toBe("ro");
    expect(localStorage.getItem("language")).toBe("ro");
  });

  it("renders children inside the provider", () => {
    const { getByText } = render(
      <LanguageProvider>
        <span>child</span>
      </LanguageProvider>,
    );
    expect(getByText("child")).toBeInTheDocument();
  });
});
