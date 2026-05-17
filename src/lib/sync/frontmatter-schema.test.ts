import { describe, it, expect } from "bun:test";
import matter from "gray-matter";
import { docoFrontmatterSchema } from "./frontmatter-schema";

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
  date?: string;
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
  });

  describe("date field YAML quirk", () => {
    it("accepts a Date object (YAML parses bare ISO dates that way)", () => {
      // gray-matter → js-yaml auto-converts `date: 2026-05-14` into a JS Date.
      // The schema must normalize that back to a string, not reject it.
      const fm: Record<string, unknown> = {
        ...validFrontmatter(),
        date: new Date("2026-05-14"),
      };
      expect(docoFrontmatterSchema.safeParse(fm).success).toBe(true);
    });

    it("still accepts a date string when authored as `'2026-05-14'`", () => {
      const fm = validFrontmatter();
      fm.date = "2026-05-14";
      expect(docoFrontmatterSchema.safeParse(fm).success).toBe(true);
    });

    it("end-to-end: gray-matter-parsed YAML with bare ISO date passes", () => {
      // The actual production path. gray-matter feeds YAML through js-yaml,
      // which auto-converts bare ISO dates to Date objects. The schema must
      // accept the Date that comes out the other side.
      const source = `---
title: Test guide
date: 2026-05-14
authors:
  - name: Tester
docolin:
  schema_version: 1
  kind: tools/test/example
  type: reference
---
body
`;
      const parsed = matter(source);
      const result = docoFrontmatterSchema.safeParse(parsed.data);
      expect(result.success).toBe(true);
    });

    it("end-to-end: exact frontmatter from docs/frontmatter-format.md passes", () => {
      // The real file's frontmatter, byte-for-byte. If this test passes but
      // the running sync still fails on this file, the problem is module
      // caching / HMR, not the schema.
      const source = `---
title: docolin frontmatter format
description: How to write the YAML frontmatter that every docolin guide starts with.
date: 2026-05-14
authors:
  - name: Oliver Seifert

docolin:
  schema_version: 1
  kind: tools/docolin/frontmatter-format
  type: reference

  applies_to:
    - docolin

  language: en
  difficulty: beginner
  time_estimate: 10m

  status: draft

  aliases: [frontmatter-spec, metadata-fields, guide-metadata]
---
body
`;
      const parsed = matter(source);
      const result = docoFrontmatterSchema.safeParse(parsed.data);
      if (!result.success) {
        // Print issues if the test fails so the failure mode is visible.
        console.error(
          "schema rejected the live file frontmatter:",
          JSON.stringify(result.error.issues, null, 2),
        );
      }
      expect(result.success).toBe(true);
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
