import { describe, it, expect } from "bun:test";
import { parseCodebergUrl, canonicalCodebergUrl, codebergEditUrl } from "./codeberg-url";

describe("parseCodebergUrl", () => {
  it("accepts https, http, ssh, .git suffix, and trailing slashes", () => {
    expect(parseCodebergUrl("https://codeberg.org/forgejo/forgejo")).toEqual({
      owner: "forgejo",
      repo: "forgejo",
    });
    expect(parseCodebergUrl("git@codeberg.org:owner/repo.git")).toEqual({
      owner: "owner",
      repo: "repo",
    });
    expect(parseCodebergUrl("https://codeberg.org/owner/repo/")).toEqual({
      owner: "owner",
      repo: "repo",
    });
  });

  it("rejects other hosts and sub-paths", () => {
    expect(parseCodebergUrl("https://github.com/owner/repo")).toBeNull();
    expect(parseCodebergUrl("https://codeberg.org/owner/repo/src/branch/main")).toBeNull();
    expect(parseCodebergUrl("https://codeberg.org/owner")).toBeNull();
  });
});

describe("URL building", () => {
  it("canonicalizes and builds the Forgejo edit route", () => {
    const parsed = parseCodebergUrl("git@codeberg.org:owner/repo.git");
    expect(parsed).not.toBeNull();
    if (parsed === null) return;
    expect(canonicalCodebergUrl(parsed)).toBe("https://codeberg.org/owner/repo");
    expect(codebergEditUrl("https://codeberg.org/owner/repo", "main", "docs/a b.md")).toBe(
      "https://codeberg.org/owner/repo/_edit/main/docs/a%20b.md",
    );
  });
});
