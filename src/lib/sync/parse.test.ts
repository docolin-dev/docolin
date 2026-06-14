import { describe, it, expect } from "bun:test";
import { parseDocoFile } from "./parse";

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
});
