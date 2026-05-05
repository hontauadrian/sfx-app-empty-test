import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HealthStatus } from "../HealthStatus";

describe("HealthStatus", () => {
  it("renders skeleton placeholders while loading", () => {
    const { container } = render(
      <HealthStatus
        label="Health"
        statusText="Connected"
        isHealthy
        isLoading
      />,
    );

    expect(screen.queryByText("Health")).toBeNull();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("renders the healthy status with the success color", () => {
    render(
      <HealthStatus
        label="Health"
        statusText="Connected"
        isHealthy
        isLoading={false}
      />,
    );

    expect(screen.getByText("Health")).toBeInTheDocument();
    const status = screen.getByText("Connected");
    expect(status).toBeInTheDocument();
    expect(status.className).toContain("text-green-500");
  });

  it("renders the unhealthy status with the destructive color", () => {
    render(
      <HealthStatus
        label="Health"
        statusText="Disconnected"
        isHealthy={false}
        isLoading={false}
      />,
    );

    const status = screen.getByText("Disconnected");
    expect(status.className).toContain("text-destructive");
  });
});
