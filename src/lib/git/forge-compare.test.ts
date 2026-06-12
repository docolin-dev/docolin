import { describe, it, expect } from "bun:test";
import { mergeFileStatus } from "./forge-compare";

// Pins the transitions the Codeberg incremental sync depends on: get these
// wrong and a doco is silently missed or ghost-deleted on the next push.
describe("mergeFileStatus", () => {
  it("passes through a first status and normalizes unknown vocabulary", () => {
    expect(mergeFileStatus(null, "added")).toBe("added");
    expect(mergeFileStatus(null, "removed")).toBe("removed");
    expect(mergeFileStatus(null, "changed")).toBe("modified");
  });

  it("nets added-then-removed to untouched", () => {
    expect(mergeFileStatus("added", "removed")).toBeNull();
  });

  it("keeps a file new while it is edited after being added", () => {
    expect(mergeFileStatus("added", "modified")).toBe("added");
  });

  it("nets modified-then-removed to removed", () => {
    expect(mergeFileStatus("modified", "removed")).toBe("removed");
  });

  it("treats deleted-then-recreated as modified", () => {
    expect(mergeFileStatus("removed", "added")).toBe("modified");
  });
});
