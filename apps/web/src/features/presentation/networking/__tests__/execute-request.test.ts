import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { executeRequest } from "../execute-request";
import type { RequestError } from "../types";

const ORIGINAL_FETCH = global.fetch;

describe("executeRequest", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
  });

  it("performs a GET against API_BASE_URL and returns the parsed response body", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const result = await executeRequest<{ ok: boolean }>({ path: "api/v1/health" });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const call = vi.mocked(global.fetch).mock.calls[0]!;
    const [url, init] = call;
    expect(String(url)).toMatch(/\/api\/v1\/health$/);
    expect(init?.method).toBe("GET");
    expect((init?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(result.data).toEqual({ ok: true });
    expect(result.status).toBe(200);
  });

  it("serializes the body as JSON when method has a payload", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 1 }), { status: 201 }),
    );

    await executeRequest({
      path: "api/v1/users",
      method: "POST",
      body: { name: "Ada" },
      headers: { "X-Trace": "abc" },
    });

    const call = vi.mocked(global.fetch).mock.calls[0]!;
    const init = call[1];
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ name: "Ada" }));
    expect((init?.headers as Record<string, string>)["X-Trace"]).toBe("abc");
  });

  it("throws a RequestError shaped from the JSON body when the response is not ok", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "boom", code: "E_BOOM" }), { status: 500 }),
    );

    await expect(executeRequest({ path: "api/v1/x" })).rejects.toMatchObject({
      message: "boom",
      status: 500,
      code: "E_BOOM",
    });
  });

  it("falls back to a default message when the error body is not JSON", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response("not-json", { status: 502 }),
    );

    await expect(executeRequest({ path: "api/v1/x" })).rejects.toMatchObject({
      message: "Request failed",
      status: 502,
    });
  });

  it("surfaces nested error envelope message + errors[] from F2 400 response", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: false,
          error: {
            statusCode: 400,
            message: "Validation failed",
            errors: [{ field: "legalName", message: "Legal name is required" }],
          },
        }),
        { status: 400 },
      ),
    );

    let captured: RequestError | undefined;
    await executeRequest({ path: "api/v1/company-info", method: "PUT", body: {} }).catch((error: RequestError) => {
      captured = error;
    });

    expect(captured?.message).toBe("Validation failed");
    expect(captured?.status).toBe(400);
    expect(captured?.errors).toEqual([{ field: "legalName", message: "Legal name is required" }]);
  });

  it("preserves the order of multiple field errors", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: false,
          error: {
            statusCode: 400,
            message: "Validation failed",
            errors: [
              { field: "legalName", message: "Legal name is required" },
              { field: "email", message: "Invalid email address" },
              { field: "phone", message: "Phone too long" },
            ],
          },
        }),
        { status: 400 },
      ),
    );

    let captured: RequestError | undefined;
    await executeRequest({ path: "api/v1/company-info", method: "PUT", body: {} }).catch((error: RequestError) => {
      captured = error;
    });

    expect(captured?.errors?.map((entry) => entry.field)).toEqual(["legalName", "email", "phone"]);
  });

  it("does not expose an errors array when the envelope has none", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: false,
          error: { statusCode: 401, message: "Unauthorized" },
        }),
        { status: 401 },
      ),
    );

    let captured: RequestError | undefined;
    await executeRequest({ path: "api/v1/company-info" }).catch((error: RequestError) => {
      captured = error;
    });

    expect(captured?.message).toBe("Unauthorized");
    expect(captured?.status).toBe(401);
    expect(captured?.errors).toBeUndefined();
  });

  it("leaves legacy top-level message intact when no envelope is present", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "legacy boom" }), { status: 400 }),
    );

    let captured: RequestError | undefined;
    await executeRequest({ path: "api/v1/x" }).catch((error: RequestError) => {
      captured = error;
    });

    expect(captured?.message).toBe("legacy boom");
    expect(captured?.errors).toBeUndefined();
  });

  it("falls back to default message and undefined errors on an empty 500", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response("", { status: 500 }));

    let captured: RequestError | undefined;
    await executeRequest({ path: "api/v1/x" }).catch((error: RequestError) => {
      captured = error;
    });

    expect(captured?.message).toBe("Request failed");
    expect(captured?.status).toBe(500);
    expect(captured?.errors).toBeUndefined();
  });

  it("ignores malformed field entries that lack string field + message", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: false,
          error: {
            statusCode: 400,
            message: "Validation failed",
            errors: [
              { field: 42, message: "bad" },
              null,
              { field: "legalName", message: "Legal name is required" },
            ],
          },
        }),
        { status: 400 },
      ),
    );

    let captured: RequestError | undefined;
    await executeRequest({ path: "api/v1/x" }).catch((error: RequestError) => {
      captured = error;
    });

    expect(captured?.errors).toEqual([{ field: "legalName", message: "Legal name is required" }]);
  });

  it("redirects to /oauth2/sign_in with rd=current on 401", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Token has expired" }), { status: 401 }),
    );
    const originalLocation = window.location;
    const assignedHrefs: string[] = [];
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        pathname: "/teams/abc",
        search: "?tab=members",
        get href() {
          return assignedHrefs[assignedHrefs.length - 1] ?? "";
        },
        set href(value: string) {
          assignedHrefs.push(value);
        },
      },
    });

    await expect(executeRequest({ path: "api/v1/auth/me" })).rejects.toMatchObject({
      status: 401,
    });
    expect(assignedHrefs).toEqual([
      "/oauth2/sign_in?rd=" + encodeURIComponent("/teams/abc?tab=members"),
    ]);

    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("does not redirect on 401 when already on /oauth2/* path", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Token has expired" }), { status: 401 }),
    );
    const originalLocation = window.location;
    const assignedHrefs: string[] = [];
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        pathname: "/oauth2/sign_in",
        search: "",
        get href() {
          return "";
        },
        set href(value: string) {
          assignedHrefs.push(value);
        },
      },
    });

    await expect(executeRequest({ path: "api/v1/auth/me" })).rejects.toMatchObject({
      status: 401,
    });
    expect(assignedHrefs).toEqual([]);

    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });
});
