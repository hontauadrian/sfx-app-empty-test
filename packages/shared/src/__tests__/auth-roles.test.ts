import { describe, expect, it } from "vitest";

import { AUTH_ROLE_ADMIN, AUTH_ROLE_AGENT } from "../auth-roles";

describe("AUTH_ROLE_ADMIN", () => {
  it("is the exact string literal 'admin'", () => {
    expect(AUTH_ROLE_ADMIN).toBe("admin");
  });

  it("is typed as the literal 'admin' (not widened to string)", () => {
    const _check: typeof AUTH_ROLE_ADMIN extends "admin" ? true : false = true;
    void _check;
    expect(_check).toBe(true);
  });
});

describe("AUTH_ROLE_AGENT", () => {
  it("is the exact string literal 'agent'", () => {
    expect(AUTH_ROLE_AGENT).toBe("agent");
  });

  it("is typed as the literal 'agent' (not widened to string)", () => {
    const _check: typeof AUTH_ROLE_AGENT extends "agent" ? true : false = true;
    void _check;
    expect(_check).toBe(true);
  });

  it("is distinct from AUTH_ROLE_ADMIN", () => {
    expect(AUTH_ROLE_AGENT).not.toBe(AUTH_ROLE_ADMIN);
  });
});
