import { describe, it, expect } from "bun:test";
import { makeImageArchiver, type ImageArchiverContext } from "./media-archive";

// Archival is off, so the archiver is pure URL resolution: repo-relative and
// root-absolute image paths become live jsDelivr URLs; external URLs pass through.

function ctx(overrides: Partial<ImageArchiverContext> = {}): ImageArchiverContext {
  return {
    bucket: {} as ImageArchiverContext["bucket"],
    projectId: "p",
    owner: "ImGajeed76",
    repo: "notra",
    ref: "abc123",
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
    expect(out).toContain("/ImGajeed76/notra@abc123/apps/docs/devtools/pic.png");
  });

  it("resolves a root-absolute path against the repo root by default", async () => {
    const out = await makeImageArchiver(ctx())("/images/x.webp");
    expect(out).toContain("/ImGajeed76/notra@abc123/images/x.webp");
  });

  it("resolves a root-absolute path against the docs root for Mintlify imports", async () => {
    // The bug this guards: /images/... was fetched from the repo root, missing
    // the apps/docs prefix.
    const out = await makeImageArchiver(ctx({ absoluteBase: "apps/docs" }))(
      "/images/dashboard/dashboard-dark.webp",
    );
    expect(out).toContain(
      "/ImGajeed76/notra@abc123/apps/docs/images/dashboard/dashboard-dark.webp",
    );
  });
});
