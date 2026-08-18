import { describe, expect, it } from "vitest";
import { readCookie } from "../src/lib/api";

describe("readCookie", () => {
  it("extracts the named cookie from a request", () => {
    const req = new Request("http://localhost:3100/api/health", {
      headers: { cookie: "mkcc_session=abc123; theme=dark" },
    });
    expect(readCookie(req, "mkcc_session")).toBe("abc123");
  });

  it("returns undefined when the cookie is absent", () => {
    const req = new Request("http://localhost:3100/api/health");
    expect(readCookie(req, "mkcc_session")).toBeUndefined();
  });

  it("decodes URL-encoded cookie values", () => {
    const req = new Request("http://localhost:3100/", {
      headers: { cookie: "mkcc_session=abc%2Bdef%3D" },
    });
    expect(readCookie(req, "mkcc_session")).toBe("abc+def=");
  });

  it("matches only the exact cookie name", () => {
    const req = new Request("http://localhost:3100/", {
      headers: { cookie: "not_mkcc_session=x" },
    });
    expect(readCookie(req, "mkcc_session")).toBeUndefined();
  });
});
