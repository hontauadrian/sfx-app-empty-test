import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { executeRequest } from "../execute-request";

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
});
