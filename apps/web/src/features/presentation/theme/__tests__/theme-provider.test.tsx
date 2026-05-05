import { act, render, renderHook } from "@testing-library/react";
import { type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ThemeProvider } from "../theme-provider";
import { useTheme } from "../use-theme";

function wrapper({ children }: { children: ReactNode }): ReactNode {
  return <ThemeProvider>{children}</ThemeProvider>;
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("starts in light mode and writes 'light' to localStorage on mount", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.mode).toBe("light");
    expect(localStorage.getItem("theme-mode")).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("hydrates the mode from localStorage when a valid value is present", () => {
    localStorage.setItem("theme-mode", "dark");
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.mode).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("toggleTheme flips the mode and persists the change", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.mode).toBe("dark");
    expect(localStorage.getItem("theme-mode")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.mode).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("renders children", () => {
    const { getByText } = render(
      <ThemeProvider>
        <span>child</span>
      </ThemeProvider>,
    );
    expect(getByText("child")).toBeInTheDocument();
  });
});
