import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../use-home", () => ({
  useHome: vi.fn(),
}));

vi.mock("../../../components/HealthStatus", () => ({
  HealthStatus: ({ statusText }: { statusText: string }): ReactNode => <div data-testid="health">{statusText}</div>,
}));

import { useHome } from "../use-home";
import { HomePage } from "../index";

describe("HomePage", () => {
  beforeEach(() => {
    vi.mocked(useHome).mockReturnValue({
      uiModel: {
        title: "SFX",
        healthLabel: "Health",
        statusText: "Connected",
        isLoading: false,
        isHealthy: true,
        isError: false,
        ctaLabel: "API Docs",
        ctaHref: "/api/docs",
        logoutLabel: "Logout",
        logoutHref: "/oauth2/sign_out?rd=/",
      },
    });
  });

  it("renders the title, health status, CTA, and logout action from the uiModel", () => {
    render(<HomePage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("SFX");
    expect(screen.getByTestId("health")).toHaveTextContent("Connected");
    const cta = screen.getByRole("link", { name: "API Docs" });
    expect(cta).toHaveAttribute("href", "/api/docs");
    const logout = screen.getByRole("link", { name: "Logout" });
    expect(logout).toHaveAttribute("href", "/oauth2/sign_out?rd=/");
  });
});
