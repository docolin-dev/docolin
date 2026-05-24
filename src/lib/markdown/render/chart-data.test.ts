import { describe, it, expect } from "bun:test";
import { buildChartModel, tableToMarkdown } from "./chart-data.ts";

describe("buildChartModel", () => {
  it("maps the first column to x and each remaining column to a numbered series", () => {
    const model = buildChartModel(
      ["Month", "Desktop", "Mobile"],
      [
        ["Jan", "186", "80"],
        ["Feb", "305", "200"],
      ],
    );
    expect(model.series).toEqual([
      { key: "s0", label: "Desktop", color: "var(--chart-1)" },
      { key: "s1", label: "Mobile", color: "var(--chart-2)" },
    ]);
    expect(model.data).toEqual([
      { x: "Jan", s0: 186, s1: 80 },
      { x: "Feb", s0: 305, s1: 200 },
    ]);
  });

  it("strips thousands separators and treats a non-numeric cell as 0", () => {
    const model = buildChartModel(
      ["Region", "Users"],
      [
        ["EU", "1,234"],
        ["NA", "n/a"],
      ],
    );
    expect(model.data).toEqual([
      { x: "EU", s0: 1234 },
      { x: "NA", s0: 0 },
    ]);
  });

  it("cycles the five-color palette once there are more than five series", () => {
    const model = buildChartModel(["X", "a", "b", "c", "d", "e", "f"], []);
    expect(model.series.map((member) => member.color)).toEqual([
      "var(--chart-1)",
      "var(--chart-2)",
      "var(--chart-3)",
      "var(--chart-4)",
      "var(--chart-5)",
      "var(--chart-1)",
    ]);
  });
});

describe("tableToMarkdown", () => {
  it("renders an aligned GFM table", () => {
    const md = tableToMarkdown(
      ["Month", "Desktop"],
      [
        ["Jan", "186"],
        ["February", "2"],
      ],
    );
    const lines = md.split("\n");
    expect(lines).toHaveLength(4); // header, divider, two rows
    expect(lines[0]).toContain("Month");
    expect(lines[0]).toContain("Desktop");
    expect(lines[1]).toContain("---"); // divider row
    expect(lines[2]).toContain("Jan");
    expect(lines[3]).toContain("February");
    // Every line padded to the same width (columns line up).
    expect(new Set(lines.map((line) => line.length)).size).toBe(1);
  });

  it("pads narrow columns up to a valid divider width", () => {
    const md = tableToMarkdown(["a", "b"], [["1", "2"]]);
    expect(md.split("\n")[1]).toBe("| --- | --- |");
  });
});
