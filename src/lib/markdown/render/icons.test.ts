import { describe, it, expect } from "bun:test";
import { resolveIconHast, faIconHast, lucideIconHast } from "./icons";

// Lucide icons are stroked (fill=none); Font Awesome icons are filled. We use
// that to tell which set an <svg> came from.
function setOf(el: { properties: Record<string, unknown> } | null): "lucide" | "fa" | null {
  if (el === null) return null;
  if (el.properties.fill === "currentColor") return "fa";
  if (el.properties.stroke === "currentColor") return "lucide";
  return null;
}

describe("icon resolution", () => {
  it("renders Lucide and Font Awesome (by pack)", () => {
    expect(setOf(lucideIconHast("rocket", "x"))).toBe("lucide");
    expect(setOf(faIconHast("star", "regular", "x"))).toBe("fa");
    expect(setOf(faIconHast("rocket", "solid", "x"))).toBe("fa");
    expect(setOf(faIconHast("github", "brands", "x"))).toBe("fa");
  });

  it("is Lucide-first for a bare name", () => {
    expect(setOf(resolveIconHast("rocket", "x"))).toBe("lucide");
    expect(setOf(resolveIconHast("git-branch", "x"))).toBe("lucide");
  });

  it("uses Font Awesome for an fa- prefix (regular preferred, then solid)", () => {
    // "rocket" exists in Lucide too, but fa- forces Font Awesome (solid here,
    // since rocket has no free regular variant).
    expect(setOf(resolveIconHast("fa-rocket", "x"))).toBe("fa");
    expect(setOf(resolveIconHast("fa-star", "x"))).toBe("fa");
  });

  it("falls back to Lucide only as a last resort for an fa- prefix", () => {
    // "sparkles" is Font Awesome Pro (not in the free packs), "git-branch" is
    // Lucide-only: an fa- name FA can't supply uses Lucide rather than nothing,
    // since Mintlify leans on FA Pro names we can't bundle.
    expect(setOf(resolveIconHast("fa-sparkles", "x"))).toBe("lucide");
    expect(setOf(resolveIconHast("fa-git-branch", "x"))).toBe("lucide");
    // But it still prefers Font Awesome when FA has the icon.
    expect(setOf(resolveIconHast("fa-rocket", "x"))).toBe("fa");
  });

  it("falls back to Font Awesome for bare names Lucide lacks", () => {
    // A brand (only in FA brands) and a solid-only icon (Lucide calls it
    // circle-alert) both resolve through the fallback to Font Awesome.
    expect(setOf(resolveIconHast("github", "x"))).toBe("fa");
    expect(setOf(resolveIconHast("circle-exclamation", "x"))).toBe("fa");
  });

  it("does not mistake a hyphenated icon name for a prefix", () => {
    // "arrow-right" is a Lucide icon; the leading "arrow" is not a set prefix.
    expect(setOf(resolveIconHast("arrow-right", "x"))).toBe("lucide");
  });

  it("returns null for an unknown icon", () => {
    expect(resolveIconHast("zzz-not-real-xyz", "x")).toBeNull();
  });
});
