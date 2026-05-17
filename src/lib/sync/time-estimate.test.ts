import { describe, it, expect } from "bun:test";
import { parseTimeEstimate } from "./time-estimate";

describe("parseTimeEstimate", () => {
  describe("single value", () => {
    it("parses minutes-only", () => {
      expect(parseTimeEstimate("15m")).toEqual({ minMinutes: 15, maxMinutes: 15 });
    });

    it("parses hours-only", () => {
      expect(parseTimeEstimate("2h")).toEqual({ minMinutes: 120, maxMinutes: 120 });
    });

    it("parses combined hours and minutes", () => {
      expect(parseTimeEstimate("1h30m")).toEqual({ minMinutes: 90, maxMinutes: 90 });
    });

    it("is case-insensitive", () => {
      expect(parseTimeEstimate("1H")).toEqual({ minMinutes: 60, maxMinutes: 60 });
    });

    it("trims whitespace", () => {
      expect(parseTimeEstimate("  15m  ")).toEqual({ minMinutes: 15, maxMinutes: 15 });
    });

    it("accepts zero-valued components", () => {
      // Authors sometimes write "0m" explicitly; not pretty but not invalid.
      expect(parseTimeEstimate("0m")).toEqual({ minMinutes: 0, maxMinutes: 0 });
    });
  });

  describe("range", () => {
    it("parses a minutes range", () => {
      expect(parseTimeEstimate("30m-1h")).toEqual({ minMinutes: 30, maxMinutes: 60 });
    });

    it("parses a hours-and-minutes range", () => {
      expect(parseTimeEstimate("1h-2h30m")).toEqual({ minMinutes: 60, maxMinutes: 150 });
    });

    it("tolerates whitespace around the dash", () => {
      expect(parseTimeEstimate("30m - 1h")).toEqual({ minMinutes: 30, maxMinutes: 60 });
    });
  });

  describe("rejects malformed input", () => {
    it("rejects a non-duration string", () => {
      expect(parseTimeEstimate("abc")).toBeNull();
    });

    it("rejects an empty string", () => {
      expect(parseTimeEstimate("")).toBeNull();
    });

    it("rejects a number without a unit", () => {
      // "30" alone is ambiguous (minutes? hours?). Reject.
      expect(parseTimeEstimate("30")).toBeNull();
    });

    it("rejects a range with max < min", () => {
      expect(parseTimeEstimate("1h-30m")).toBeNull();
    });

    it("rejects a unit without a number", () => {
      expect(parseTimeEstimate("h")).toBeNull();
      expect(parseTimeEstimate("m")).toBeNull();
    });

    it("rejects duplicate units", () => {
      expect(parseTimeEstimate("1h2h")).toBeNull();
    });
  });
});
