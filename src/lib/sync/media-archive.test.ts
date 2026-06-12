import { describe, it, expect } from "bun:test";
import { makeImageArchiver, type ImageArchiverContext } from "./media-archive";

// Archival is off, so the archiver is pure URL resolution: repo-relative and
// root-absolute image paths resolve through the forge's rawUrl builder;
// external URLs pass through untouched.

function ctx(overrides: Partial<ImageArchiverContext> = {}): ImageArchiverContext {
  return {
    bucket: {} as ImageArchiverContext["bucket"],
    projectId: "p",
    // Stand-in for the forge's raw-content URL builder (jsDelivr / codeberg
    // raw); the tests only assert which repo path the archiver asked for.
    rawUrl: (path) => `https://raw.example.test/repo@abc123/${path}`,
    docoPath: "apps/docs/devtools/mcp.mdx",
    onError: () => undefined,
    ...overrides,
  };
}

describe("makeImageArchiver", () => {
  it("leaves external URLs untouched", async () => {
    const out = await makeImageArchiver(ctx())("https://cdn.example.com/x.png");
    expect(out).toBe("https://cdn.example.com/x.png");
  });

  it("resolves a relative path against the doco's directory", async () => {
    const out = await makeImageArchiver(ctx())("./pic.png");
    expect(out).toBe("https://raw.example.test/repo@abc123/apps/docs/devtools/pic.png");
  });

  it("resolves a root-absolute path against the repo root by default", async () => {
    const out = await makeImageArchiver(ctx())("/images/x.webp");
    expect(out).toBe("https://raw.example.test/repo@abc123/images/x.webp");
  });

  it("resolves a root-absolute path against the docs root for Mintlify imports", async () => {
    // The bug this guards: /images/... was fetched from the repo root, missing
    // the apps/docs prefix.
    const out = await makeImageArchiver(ctx({ absoluteBase: "apps/docs" }))(
      "/images/dashboard/dashboard-dark.webp",
    );
    expect(out).toBe(
      "https://raw.example.test/repo@abc123/apps/docs/images/dashboard/dashboard-dark.webp",
    );
  });
});
