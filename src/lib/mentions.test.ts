import { describe, it, expect } from "bun:test";
import { extractMentionHandles } from "./mentions";

describe("extractMentionHandles", () => {
  it("finds mentions at start, mid-sentence, and after punctuation", () => {
    expect(extractMentionHandles("@alice can you check?")).toEqual(["alice"]);
    expect(extractMentionHandles("ping @bob-2 and (@carol)")).toEqual(["bob-2", "carol"]);
  });

  it("never reads an email address as a mention", () => {
    expect(extractMentionHandles("mail me at user@example.com please")).toEqual([]);
  });

  it("lowercases and dedupes", () => {
    expect(extractMentionHandles("@Alice @alice @ALICE")).toEqual(["alice"]);
  });

  it("ignores bare and too-short @ tokens", () => {
    expect(extractMentionHandles("a @ b @x c")).toEqual([]);
  });

  it("caps the fan-out", () => {
    const text = Array.from({ length: 20 }, (_, i) => `@user-${i.toString()}`).join(" ");
    expect(extractMentionHandles(text).length).toBe(10);
  });
});
