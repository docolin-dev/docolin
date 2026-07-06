import { describe, it, expect } from "bun:test";
import { safeReturnPathname } from "./return-to";

// The open-redirect guard for sign-in returnTo values. These pin the exact
// accept/reject line: a regression here turns docolin auth into a phishing
// bounce (/signin?returnTo=https://evil.example).

describe("safeReturnPathname", () => {
  it("accepts same-origin relative paths, query included", () => {
    expect(safeReturnPathname("/")).toBe("/");
    expect(safeReturnPathname("/notra/docs/overview")).toBe("/notra/docs/overview");
    expect(safeReturnPathname("/search?q=firewall")).toBe("/search?q=firewall");
    expect(safeReturnPathname("/de/browse")).toBe("/de/browse");
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(safeReturnPathname("https://evil.example")).toBe("/");
    expect(safeReturnPathname("http://evil.example/x")).toBe("/");
    // "//host" and "/\host" both resolve as protocol-relative in browsers.
    expect(safeReturnPathname("//evil.example")).toBe("/");
    expect(safeReturnPathname("/\\evil.example")).toBe("/");
    expect(safeReturnPathname("javascript:alert(1)")).toBe("/");
  });

  it("rejects the control-character bypass (URL parsers strip tab/LF/CR)", () => {
    // "/\t/evil.example" passes a naive second-char check but the browser
    // strips the tab and resolves "//evil.example". The guard must strip the
    // same characters before validating.
    expect(safeReturnPathname("/\t/evil.example")).toBe("/");
    expect(safeReturnPathname("/\n/evil.example")).toBe("/");
    expect(safeReturnPathname("/\r/evil.example")).toBe("/");
    expect(safeReturnPathname("\t//evil.example")).toBe("/");
    // A stripped-but-safe path comes back cleaned, not raw.
    expect(safeReturnPathname("/doc\ns")).toBe("/docs");
  });

  it("falls back on empty or missing values, honoring a custom fallback", () => {
    expect(safeReturnPathname(null)).toBe("/");
    expect(safeReturnPathname(undefined)).toBe("/");
    expect(safeReturnPathname("")).toBe("/");
    expect(safeReturnPathname("evil", "/dashboard")).toBe("/dashboard");
  });
});
