import { describe, it, expect } from "bun:test";
import { docoFrontmatterSchema, isExampleKind } from "./frontmatter-schema";

// Loose test-fixture shape: each field is optional so individual tests can
// mutate or delete without fighting the type checker. The fixture builder
// always returns a minimal valid frontmatter; tests construct invalid variants
// by mutation.
interface TestDocolinBlock {
  schema_version?: number;
  kind?: string;
  type?: string;
  applies_to?: string[];
  language?: string;
  difficulty?: string;
  time_estimate?: string;
  status?: string;
  superseded_by?: string;
  aliases?: string[];
  references?: string[];
  prev?: string;
  next?: string;
}

interface TestFrontmatter {
  title?: string;
  description?: string;
  authors?: {
    handle?: string;
    name?: string;
    username?: string;
    url?: string;
  }[];
  docolin: TestDocolinBlock;
}

function validFrontmatter(): TestFrontmatter {
  return {
    title: "Install Nvidia drivers",
    authors: [{ handle: "someuser" }],
    docolin: {
      schema_version: 1,
      kind: "hardware/gpu/nvidia/driver-install",
      type: "how-to",
    },
  };
}

describe("docoFrontmatterSchema", () => {
  describe("happy path", () => {
    it("accepts a minimal valid frontmatter", () => {
      const result = docoFrontmatterSchema.safeParse(validFrontmatter());
      expect(result.success).toBe(true);
    });

    it("accepts external author entries", () => {
      const fm = validFrontmatter();
      fm.authors = [{ name: "Alice", username: "alice", url: "https://github.com/alice" }];
      const result = docoFrontmatterSchema.safeParse(fm);
      expect(result.success).toBe(true);
    });
  });

  describe("required fields", () => {
    it("rejects missing title", () => {
      const fm = validFrontmatter();
      delete fm.title;
      expect(docoFrontmatterSchema.safeParse(fm).success).toBe(false);
    });

    it("rejects missing authors", () => {
      const fm = validFrontmatter();
      delete fm.authors;
      expect(docoFrontmatterSchema.safeParse(fm).success).toBe(false);
    });

    it("rejects an empty authors list", () => {
      const fm = validFrontmatter();
      fm.authors = [];
      expect(docoFrontmatterSchema.safeParse(fm).success).toBe(false);
    });

    it("rejects missing docolin block", () => {
      const fm = validFrontmatter();
      delete (fm as Partial<TestFrontmatter>).docolin;
      expect(docoFrontmatterSchema.safeParse(fm).success).toBe(false);
    });
  });

  describe("author shape", () => {
    it("rejects an author with both handle and name", () => {
      const fm = validFrontmatter();
      fm.authors = [{ handle: "x", name: "Y" }];
      expect(docoFrontmatterSchema.safeParse(fm).success).toBe(false);
    });

    it("rejects an author with neither handle nor name", () => {
      const fm = validFrontmatter();
      fm.authors = [{ url: "https://example.com" }];
      expect(docoFrontmatterSchema.safeParse(fm).success).toBe(false);
    });

    it("rejects username/url alongside handle", () => {
      // handle implies a docolin profile lookup; external fields don't apply.
      const fm = validFrontmatter();
      fm.authors = [{ handle: "x", username: "y" }];
      expect(docoFrontmatterSchema.safeParse(fm).success).toBe(false);
    });
  });

  describe("kind path", () => {
    it("accepts 2-5 valid segments", () => {
      for (const path of [
        "os/firewall",
        "hardware/gpu/nvidia",
        "data/postgres/replication/setup",
        "hardware/gpu/nvidia/driver/install",
      ]) {
        const fm = validFrontmatter();
        fm.docolin.kind = path;
        expect(docoFrontmatterSchema.safeParse(fm).success).toBe(true);
      }
    });

    it("accepts the example sandbox domain", () => {
      const fm = validFrontmatter();
      fm.docolin.kind = "example/hello";
      expect(docoFrontmatterSchema.safeParse(fm).success).toBe(true);
    });

    it("rejects single-segment kinds", () => {
      const fm = validFrontmatter();
      fm.docolin.kind = "os";
      expect(docoFrontmatterSchema.safeParse(fm).success).toBe(false);
    });

    it("rejects 6+ segment kinds", () => {
      const fm = validFrontmatter();
      fm.docolin.kind = "a/b/c/d/e/f";
      expect(docoFrontmatterSchema.safeParse(fm).success).toBe(false);
    });

    it("rejects uppercase characters in segments", () => {
      const fm = validFrontmatter();
      fm.docolin.kind = "Hardware/gpu";
      expect(docoFrontmatterSchema.safeParse(fm).success).toBe(false);
    });

    it("rejects unreserved top-level domains", () => {
      // Top-level segments must be reserved (os, hardware, software, ...).
      // Otherwise URL disambiguation breaks: /fake/topic is indistinguishable
      // from an org-scoped path.
      const fm = validFrontmatter();
      fm.docolin.kind = "fake/topic";
      expect(docoFrontmatterSchema.safeParse(fm).success).toBe(false);
    });

    it("isExampleKind matches the sandbox root in ltree and display form", () => {
      expect(isExampleKind("example/hello")).toBe(true);
      expect(isExampleKind("example.hello")).toBe(true);
      expect(isExampleKind("example")).toBe(true);
      expect(isExampleKind("os/linux/firewall")).toBe(false);
      expect(isExampleKind("tools/example/hello")).toBe(false);
      expect(isExampleKind("examples/x")).toBe(false);
    });
  });

  describe("status / superseded_by interplay", () => {
    it("rejects status=deprecated without superseded_by", () => {
      const fm = validFrontmatter();
      fm.docolin.status = "deprecated";
      expect(docoFrontmatterSchema.safeParse(fm).success).toBe(false);
    });

    it("accepts status=deprecated with superseded_by", () => {
      const fm = validFrontmatter();
      fm.docolin.status = "deprecated";
      fm.docolin.superseded_by = "/data/postgres/replication/setup";
      expect(docoFrontmatterSchema.safeParse(fm).success).toBe(true);
    });
  });
});
