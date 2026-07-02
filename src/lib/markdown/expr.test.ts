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
