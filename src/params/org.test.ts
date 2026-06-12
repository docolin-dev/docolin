import { describe, it, expect } from "bun:test";
import { match } from "./org";

describe("org param matcher", () => {
  it("accepts plausible org and user slugs", () => {
    expect(match("imgajeed")).toBe(true);
    expect(match("some-org")).toBe(true);
  });

  it("rejects endpoint-only segments so clicks fall through to full navigation", () => {
    for (const segment of ["api", "signin", "signout", "callback", "raw"]) {
      expect(match(segment)).toBe(false);
    }
  });

  it("rejects OAuth discovery paths so probes get clean 404s, not page routes", () => {
    // The claude.ai MCP broker probes POST /register during its authless
    // handshake (anthropics/claude-ai-mcp#262). When the org page route
    // matched it, SvelteKit answered 405 instead of the 404 the authless
    // contract requires, and the broker read that as a broken sign-in
    // service. Same for the RFC 8615 .well-known namespace, which can
    // never be content.
    expect(match("register")).toBe(false);
    expect(match(".well-known")).toBe(false);
  });
});
