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

const EXPECTED_LOGOUT_HREF =
  "/oauth2/sign_out?rd=http%3A%2F%2Fkeycloak.localtest.me%3A9080%2Frealms%2Fsfx-webapp-boilerplate%2Fprotocol%2Fopenid-connect%2Flogout%3Fclient_id%3Dsfx-webapp-boilerplate-dev-proxy%26post_logout_redirect_uri%3Dhttp%253A%252F%252Fapp.localtest.me%253A4181%252F";

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
        logoutHref: EXPECTED_LOGOUT_HREF,
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
    expect(logout).toHaveAttribute("href", EXPECTED_LOGOUT_HREF);
  });
});
