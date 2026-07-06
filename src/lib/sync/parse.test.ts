import { describe, it, expect } from "bun:test";
import { checkDocoSourceSize, parseDocoFile } from "./parse";
import { LIMITS } from "$lib/limits";

// The frontmatter split is hand-rolled (no gray-matter, which pulls in Node's
// Buffer and crashes in the browser preview). These pin the split's edge cases
// so a future tweak can't silently break sync or the local preview.

const VALID_FM = [
  "title: Install Nvidia drivers",
  "authors:",
  "  - handle: someuser",
  "docolin:",
  "  schema_version: 1",
  "  kind: hardware/gpu/nvidia/driver-install",
  "  type: how-to",
].join("\n");

function doc(body: string, opts: { fence?: string; bom?: boolean } = {}): string {
  const fence = opts.fence ?? "---";
  const text = `---\n${VALID_FM}\n${fence}\n${body}`;
  return opts.bom === true ? `\uFEFF${text}` : text;
}

describe("parseDocoFile", () => {
  it("splits frontmatter from body and parses the YAML", () => {
    const result = parseDocoFile(doc("Hello world\n"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.frontmatter.title).toBe("Install Nvidia drivers");
    expect(result.parsed.frontmatter.docolin.kind).toBe("hardware/gpu/nvidia/driver-install");
    expect(result.parsed.body).toBe("Hello world\n");
  });

  it("strips a leading UTF-8 BOM before the opening fence", () => {
    const result = parseDocoFile(doc("Body\n", { bom: true }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.frontmatter.title).toBe("Install Nvidia drivers");
    expect(result.parsed.body).toBe("Body\n");
  });

  it("accepts the `...` YAML document terminator as the closing fence", () => {
    const result = parseDocoFile(doc("After\n", { fence: "..." }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.body).toBe("After\n");
  });

  it("keeps a horizontal-rule `---` in the body (only the first close counts)", () => {
    const result = parseDocoFile(doc("intro\n\n---\n\nmore\n"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.body).toContain("---");
    expect(result.parsed.body).toContain("more");
  });

  it("reports malformed YAML as a yaml_parse_error", () => {
    const broken = "---\ntitle: [unterminated\n---\nbody\n";
    const result = parseDocoFile(broken);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("yaml_parse_error");
  });

  it("treats a file with no frontmatter fence as invalid, body untouched", () => {
    const result = parseDocoFile("# Just a heading\n\nNo frontmatter here.\n");
    // No `docolin` block, so the schema rejects it, but the parser must not throw.
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("frontmatter_invalid");
  });

  it("captures the whole original frontmatter, custom keys included, in frontmatterExtra", () => {
    const src = [
      "---",
      "title: Install Nvidia drivers",
      "description: A guide",
      "authors:",
      "  - handle: someuser",
      "tags: [gpu, drivers]",
      "sidebar_order: 3",
      "docolin:",
      "  schema_version: 1",
      "  kind: hardware/gpu/nvidia/driver-install",
      "  type: how-to",
      "---",
      "Body\n",
    ].join("\n");
    const result = parseDocoFile(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const extra = result.parsed.frontmatterExtra;
    // Custom keys the schema would otherwise strip are preserved verbatim.
    expect(extra.tags).toEqual(["gpu", "drivers"]);
    expect(extra.sidebar_order).toBe(3);
    // The author's own fields and their docolin block are kept alongside.
    expect(extra.title).toBe("Install Nvidia drivers");
    expect((extra.docolin as Record<string, unknown>).kind).toBe(
      "hardware/gpu/nvidia/driver-install",
    );
  });

  it("rejects an oversized source as file_too_large before parsing", () => {
    const result = parseDocoFile(doc("x".repeat(LIMITS.docoSourceBytes + 1)));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("file_too_large");
    expect(result.error.details.limitBytes).toBe(LIMITS.docoSourceBytes);
  });
});

describe("checkDocoSourceSize", () => {
  it("passes at exactly the limit and measures bytes, not code units", () => {
    expect(checkDocoSourceSize("x".repeat(LIMITS.docoSourceBytes))).toBeNull();
    // "ä" is 1 UTF-16 code unit but 2 UTF-8 bytes: a string whose length sits
    // under the limit must still be rejected when its bytes exceed it.
    const overByBytes = "ä".repeat(Math.ceil(LIMITS.docoSourceBytes / 2) + 1);
    expect(overByBytes.length).toBeLessThanOrEqual(LIMITS.docoSourceBytes);
    expect(checkDocoSourceSize(overByBytes)?.code).toBe("file_too_large");
  });
});
