import { describe, it, expect } from "bun:test";
import { evaluateExpression, expressionIdentifiers } from "./expr.ts";

// The evaluator is security-critical (hostile doco authors, runs on readers'
// clients), so this suite is half correctness, half attack payloads. Every
// hostile case must throw; none may reach a prototype, a constructor, or
// anything callable outside the seven built-ins.

const vars = { port: 8080, host: "example.com", secure: true, name: "Pango" };

describe("evaluateExpression: correctness", () => {
  it("does arithmetic with standard precedence", () => {
    expect(evaluateExpression("1 + 2 * 3", {})).toBe(7);
    expect(evaluateExpression("(1 + 2) * 3", {})).toBe(9);
    expect(evaluateExpression("10 % 3", {})).toBe(1);
    expect(evaluateExpression("-port + 80", vars)).toBe(-8000);
  });

  it("concatenates when either side of + is a string", () => {
    expect(evaluateExpression('"port: " + port', vars)).toBe("port: 8080");
    expect(evaluateExpression("port + 1", vars)).toBe(8081);
  });

  it("resolves variables and errors on unknown ones", () => {
    expect(evaluateExpression("host", vars)).toBe("example.com");
    expect(() => evaluateExpression("missing", vars)).toThrow("unknown variable");
  });

  it("compares strictly and only within one type", () => {
    expect(evaluateExpression("port == 8080", vars)).toBe(true);
    expect(evaluateExpression('port != "8080"', vars)).toBe(true); // strict, no juggling
    expect(evaluateExpression("port > 80", vars)).toBe(true);
    expect(() => evaluateExpression('port < "9000"', vars)).toThrow("cannot compare");
  });

  it("supports ternary and short-circuiting logic", () => {
    expect(evaluateExpression('secure ? "https" : "http"', vars)).toBe("https");
    // The untaken side would throw (unknown var); short-circuit must skip it.
    expect(evaluateExpression("secure || missing", vars)).toBe(true);
    expect(evaluateExpression("!secure && missing", vars)).toBe(false);
  });

  it("runs the built-in functions", () => {
    expect(evaluateExpression("round(3.14159, 2)", {})).toBe(3.14);
    expect(evaluateExpression("min(3, 1, 2)", {})).toBe(1);
    expect(evaluateExpression("max(3, 1, 2)", {})).toBe(3);
    expect(evaluateExpression('upper("abc")', {})).toBe("ABC");
    expect(evaluateExpression('lower("ABC")', {})).toBe("abc");
    expect(evaluateExpression('trim("  x  ")', {})).toBe("x");
    expect(evaluateExpression('urlencode("a b&c")', {})).toBe("a%20b%26c");
    expect(() => evaluateExpression("min()", {})).toThrow("at least one argument");
  });

  it("runs the extended helper functions", () => {
    expect(evaluateExpression("abs(-4)", {})).toBe(4);
    expect(evaluateExpression("floor(4.9)", {})).toBe(4);
    expect(evaluateExpression("ceil(4.1)", {})).toBe(5);
    expect(evaluateExpression("sqrt(16)", {})).toBe(4);
    expect(evaluateExpression("clamp(15, 1, 10)", {})).toBe(10);
    expect(evaluateExpression('capitalize("pango")', {})).toBe("Pango");
    expect(evaluateExpression('length("abcd")', {})).toBe(4);
    expect(evaluateExpression('contains("pangolin", "gol")', {})).toBe(true);
    expect(evaluateExpression('replace("a-b-c", "-", ".")', {})).toBe("a.b.c");
    expect(evaluateExpression('replace("abc", "", "x")', {})).toBe("abc"); // empty find is a no-op
    expect(evaluateExpression('slice("pangolin", 0, 5)', {})).toBe("pango");
    expect(evaluateExpression('slice("pangolin", 4)', {})).toBe("olin");
    expect(evaluateExpression('b64encode("user:pass")', {})).toBe("dXNlcjpwYXNz");
  });

  it("converts colors between the big four formats", () => {
    expect(evaluateExpression('tohex("rgb(118 185 0)")', {})).toBe("#76b900");
    expect(evaluateExpression('torgb("#76b900")', {})).toBe("rgb(118 185 0)");
    expect(evaluateExpression('tohsl("#ff0000")', {})).toBe("hsl(0 100% 50%)");
    // The oklch round trip is lossy by one bit through the 3-decimal string
    // form; assert it stays within one step per channel.
    const roundTripped = String(evaluateExpression('tohex(tooklch("#76b900"))', {}));
    for (const [i, expected] of [0x76, 0xb9, 0x00].entries()) {
      const channel = parseInt(roundTripped.slice(1 + i * 2, 3 + i * 2), 16);
      expect(Math.abs(channel - expected)).toBeLessThanOrEqual(1);
    }
    expect(() => evaluateExpression('tohex("hwb(120 0% 0%)")', {})).toThrow("not a convertible");
    expect(() => evaluateExpression('tohex("red")', {})).toThrow("not a convertible");
  });

  it("runs the string predicates, padding, and number formatting", () => {
    expect(evaluateExpression('startswith("pangolin", "pango")', {})).toBe(true);
    expect(evaluateExpression('endswith("pangolin", "lin")', {})).toBe(true);
    expect(evaluateExpression('padstart("7", 3, "0")', {})).toBe("007");
    expect(evaluateExpression('padend("ab", 5, ".")', {})).toBe("ab...");
    expect(evaluateExpression('padstart("x", 999999)', {}).toString().length).toBe(200); // clamped
    expect(String(evaluateExpression("numberformat(50000)", {}))).toContain("50");
  });

  it("manipulates colors perceptually, keeping the input's format family", () => {
    const lighter = String(evaluateExpression('lighten("#76b900", 0.2)', {}));
    expect(lighter.startsWith("#")).toBe(true);
    expect(lighter).not.toBe("#76b900");
    const rgbDarker = String(evaluateExpression('darken("rgb(118 185 0)", 0.2)', {}));
    expect(rgbDarker.startsWith("rgb(")).toBe(true);
    expect(String(evaluateExpression('alpha("#76b900", 0.5)', {}))).toBe("#76b90080");
    expect(evaluateExpression('contrast("#76b900")', {})).toBe("#000000");
    expect(evaluateExpression('contrast("#1a1a2b")', {})).toBe("#ffffff");
  });

  it("does calendar math on ISO dates with a frozen today()", () => {
    const today = "2026-07-03";
    expect(evaluateExpression("today()", {}, today)).toBe("2026-07-03");
    expect(evaluateExpression('dateadd(today(), 10, "days")', {}, today)).toBe("2026-07-13");
    expect(evaluateExpression('dateadd("2026-01-31", 1, "month")', {}, today)).toBe("2026-02-28");
    expect(evaluateExpression('dateadd("2026-07-03", 2, "weeks")', {}, today)).toBe("2026-07-17");
    expect(evaluateExpression('dateadd("2024-02-29", 1, "years")', {}, today)).toBe("2025-02-28");
    expect(evaluateExpression('datediff(today(), "2026-12-31")', {}, today)).toBe(181);
    expect(evaluateExpression('weekday("2026-07-03")', {}, today)).toBe(5); // a Friday
    expect(() => evaluateExpression('dateadd("2026-02-31", 1, "days")', {}, today)).toThrow(
      "not a date",
    );
    expect(() => evaluateExpression('dateadd(today(), 1, "fortnights")', {}, today)).toThrow(
      "unknown date unit",
    );
  });

  it("formats dates for prose", () => {
    const formatted = evaluateExpression('dateformat("2026-07-03", "medium")', {}, "2026-07-03");
    expect(String(formatted)).toContain("2026");
    expect(() => evaluateExpression('dateformat("2026-07-03", "fancy")', {})).toThrow(
      "unknown date style",
    );
  });

  it("propagates NaN instead of throwing (presentation is the render layer's job)", () => {
    expect(evaluateExpression("0 / 0", {})).toBeNaN();
    expect(evaluateExpression('"a" * 2', {})).toBeNaN();
  });

  it("clamps round digits so the internal power cannot overflow", () => {
    expect(evaluateExpression("round(1.5, 999999)", {})).toBe(1.5);
  });
});

describe("evaluateExpression: hostile payloads", () => {
  const deny = (expr: string, scope: Record<string, string | number | boolean> = {}): void => {
    expect(() => evaluateExpression(expr, scope)).toThrow();
  };

  it("denies every property-access route to constructors and prototypes", () => {
    deny("constructor"); // bare: unknown variable (null-prototype scope)
    deny("__proto__");
    deny("toString");
    deny('"".constructor'); // MemberExpression
    deny('"".constructor.constructor("return 1")()');
    deny("(1).toString");
    deny("host['constructor']", { host: "x" });
  });

  it("denies calls to anything but the built-ins", () => {
    deny("alert(1)");
    deny("constructor(1)");
    deny('upper["call"]("x")');
  });

  it("denies non-scalar constructs", () => {
    deny("[1, 2, 3]");
    deny("null");
    deny("this");
    deny("a; b", { a: 1, b: 2 }); // compound
  });

  it("denies operators outside the grammar", () => {
    deny("1 | 2");
    deny("1 & 2");
    deny("1 << 2");
    deny("~1");
  });

  it("bounds input size, nesting depth, and output size", () => {
    deny(`1 + ${"1 + ".repeat(400)}1`); // > 1024 chars
    deny(`${"!".repeat(60)}secure`, { secure: true }); // > 48 deep
    deny("long + long", { long: "x".repeat(6000) }); // > 10k result
  });

  it("never resolves inherited keys even when attacked via the scope", () => {
    // A plain-object scope would answer 'constructor' via the prototype chain;
    // the null-prototype copy must not.
    expect(() => evaluateExpression("constructor", { port: 1 })).toThrow("unknown variable");
  });
});

describe("expressionIdentifiers", () => {
  it("collects variable names but not function callees", () => {
    expect(expressionIdentifiers("round(port * factor, 2)")?.sort()).toEqual(["factor", "port"]);
  });

  it("returns null for non-expressions (Helm/Jinja stays literal)", () => {
    expect(expressionIdentifiers(".Values.replicas")).toBeNull();
    // jsep PARSES this (unary minus + compound), so the grammar allowlist, not
    // parse failure, is what must reject it.
    expect(expressionIdentifiers("- if .Values.enabled")).toBeNull();
    expect(expressionIdentifiers('include "chart.name" .')).toBeNull();
    expect(expressionIdentifiers("user | capitalize")).toBeNull(); // Jinja filter
  });

  it("returns null when a call targets anything but a built-in", () => {
    expect(expressionIdentifiers("lookup(name)")).toBeNull();
  });

  it("collects names on both sides of operators and in ternaries", () => {
    expect(expressionIdentifiers("a ? b : c + d")?.sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("returns an empty list for pure math", () => {
    expect(expressionIdentifiers("1 + 2")).toEqual([]);
  });
});
