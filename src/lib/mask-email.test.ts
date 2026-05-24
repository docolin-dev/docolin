import { describe, it, expect } from "bun:test";
import { maskEmail } from "./mask-email";

// All addresses here are RFC 2606 reserved example domains, never anyone's real
// email.
describe("maskEmail", () => {
  it("keeps the first two local chars and the TLD, masking the rest", () => {
    expect(maskEmail("jane.doe123@example.net")).toBe("ja•••@•••.net");
  });

  it("uses fixed-length bullets so the address length isn't leaked", () => {
    // Both mask to the same shape despite very different real lengths.
    expect(maskEmail("ab@example.io")).toBe("ab•••@•••.io");
    expect(maskEmail("abcdefghijklmnop@example.io")).toBe("ab•••@•••.io");
  });

  it("handles a one-character local part", () => {
    expect(maskEmail("a@example.com")).toBe("a•••@•••.com");
  });

  it("masks a domain with no dot (no TLD to show)", () => {
    expect(maskEmail("user@localhost")).toBe("us•••@•••");
  });

  it("falls back to bullets for a non-email string", () => {
    expect(maskEmail("notanemail")).toBe("•••");
    expect(maskEmail("")).toBe("•••");
    expect(maskEmail("@nolocal.com")).toBe("•••");
  });
});
