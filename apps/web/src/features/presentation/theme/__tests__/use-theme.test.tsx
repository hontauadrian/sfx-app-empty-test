import { renderHook } from "@testing-library/react";
import { type ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { ThemeProvider } from "../theme-provider";
import { useTheme } from "../use-theme";

describe("useTheme", () => {
  it("returns the active theme when used inside a ThemeProvider", () => {
    function wrapper({ children }: { children: ReactNode }): ReactNode {
      return <ThemeProvider>{children}</ThemeProvider>;
    }
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.mode).toBe("light");
    expect(typeof result.current.toggleTheme).toBe("function");
    expect(result.current.colors).toBeDefined();
  });

  it("throws when used outside a ThemeProvider", () => {
    expect(() => renderHook(() => useTheme())).toThrow(
      "useTheme must be used within a ThemeProvider",
    );
  });
});
