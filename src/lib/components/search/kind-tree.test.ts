import { describe, it, expect } from "bun:test";
import { buildKindTree } from "./kind-tree";

describe("buildKindTree", () => {
  it("nests by ltree segment and rolls counts up to ancestors", () => {
    const tree = buildKindTree([
      { path: "hardware.gpu.nvidia", count: 3 },
      { path: "hardware.gpu.amd", count: 2 },
      { path: "hardware.cpu", count: 1 },
    ]);

    expect(tree).toHaveLength(1);
    const hardware = tree[0];
    expect(hardware.path).toBe("hardware");
    expect(hardware.count).toBe(6); // 3 + 2 + 1

    const gpu = hardware.children.find((n) => n.path === "hardware.gpu");
    expect(gpu?.count).toBe(5); // 3 + 2
    expect(gpu?.children.map((n) => n.path).sort()).toEqual([
      "hardware.gpu.amd",
      "hardware.gpu.nvidia",
    ]);
  });

  it("sorts heaviest first at each level", () => {
    const tree = buildKindTree([
      { path: "a.light", count: 1 },
      { path: "a.heavy", count: 9 },
    ]);
    expect(tree[0].children.map((n) => n.label)).toEqual(["Heavy", "Light"]);
  });

  it("labels segments by titleizing and converting underscores", () => {
    const tree = buildKindTree([{ path: "tools.steps_accordion", count: 1 }]);
    expect(tree[0].children[0].label).toBe("Steps Accordion");
  });
});
