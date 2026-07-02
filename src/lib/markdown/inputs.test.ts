import { describe, it, expect } from "bun:test";
import {
  parseDeclarationLine,
  parseDeclarations,
  resolveVars,
  isValidVarName,
  type VarDeclaration,
} from "./inputs.ts";
import { evaluateExpression } from "./expr.ts";

describe("parseDeclarationLine", () => {
  it("parses a full input declaration", () => {
    const result = parseDeclarationLine(
      'api_key: API key { secret placeholder="sk-..." maxlen=128 }',
    );
    expect(result).toEqual({
      decl: {
        kind: "input",
        name: "api_key",
        label: "API key",
        type: "text",
        secret: true,
        placeholder: "sk-...",
        defaultValue: null,
        min: null,
        max: null,
        maxlen: 128,
      },
    });
  });

  it("parses a number input with bounds and default", () => {
    const result = parseDeclarationLine(
      "replicas: Replicas { type=number min=1 max=10 default=3 }",
    );
    expect(result).toMatchObject({
      decl: { kind: "input", type: "number", min: 1, max: 10, defaultValue: "3" },
    });
  });

  it("falls back to the name as label and text type", () => {
    expect(parseDeclarationLine("host:")).toMatchObject({
      decl: { kind: "input", name: "host", label: "host", type: "text", secret: false },
    });
  });

  it("parses a computed declaration, expression kept raw", () => {
    const result = parseDeclarationLine('endpoint := host + "/v1?key=" + urlencode(api_key)');
    expect(result).toEqual({
      decl: { kind: "computed", name: "endpoint", expr: 'host + "/v1?key=" + urlencode(api_key)' },
    });
  });

  // The problem text of a line that must NOT parse as a declaration.
  function problemOf(line: string): string {
    const result = parseDeclarationLine(line);
    if (!("problem" in result)) throw new Error(`expected a problem for: ${line}`);
    return result.problem;
  }

  it("reports author mistakes as problems, never throws", () => {
    expect(problemOf("just some text")).toContain("not a declaration");
    expect(problemOf("bad-name: Label")).toContain("invalid variable name");
    expect(problemOf("x: L { secrett }")).toContain('unknown attribute "secrett"');
    expect(problemOf("x: L { type=email }")).toContain("unknown input type");
    expect(problemOf("x :=")).toContain("no expression");
  });

  it("unwraps autolinked URLs in attr values (canonicalizer round-trip)", () => {
    expect(parseDeclarationLine('host: Host { type=url default="<https://x.com>" }')).toMatchObject(
      { decl: { defaultValue: "https://x.com" } },
    );
  });

  it("unescapes markdown backslash-escapes (the canonicalizer escapes * and _)", () => {
    expect(parseDeclarationLine("total := a \\* b")).toEqual({
      decl: { kind: "computed", name: "total", expr: "a * b" },
    });
    expect(parseDeclarationLine("snake\\_case: Label")).toMatchObject({
      decl: { kind: "input", name: "snake_case" },
    });
  });

  it("reserves literal and function names", () => {
    expect(isValidVarName("round")).toBe(false);
    expect(isValidVarName("true")).toBe(false);
    expect(isValidVarName("port_2")).toBe(true);
    expect(isValidVarName("2port")).toBe(false);
    expect(isValidVarName("a.b")).toBe(false); // dotted can never be declared
  });
});

describe("parseDeclarations", () => {
  it("keeps the first declaration on duplicates and reports the repeat", () => {
    const { declarations, problems } = parseDeclarations(["port: A { type=number }", "port: B"]);
    expect(declarations).toHaveLength(1);
    expect(declarations[0]).toMatchObject({ label: "A" });
    expect(problems[0]).toContain("declared twice");
  });
});

const evaluate = evaluateExpression;

function decls(lines: string[]): VarDeclaration[] {
  const parsed = parseDeclarations(lines);
  expect(parsed.problems).toEqual([]);
  return parsed.declarations;
}

describe("resolveVars", () => {
  it("resolves inputs, defaults, and computed values in dependency order", () => {
    const declarations = decls([
      "host: Host { default=example.com }",
      "port: Port { type=number default=8080 }",
      // Deliberately declared before its dependency resolves it anyway.
      'url := base + ":" + port',
      'base := "https://" + host',
    ]);
    const { values, errors, tainted } = resolveVars(declarations, {}, evaluate);
    expect(errors).toEqual({});
    expect(values.url).toBe("https://example.com:8080");
    expect(tainted.size).toBe(0);
  });

  it("taints everything derived from an unfilled input", () => {
    const declarations = decls([
      "key: Key",
      'q := "?key=" + key',
      "n: N { type=number default=2 }",
    ]);
    const { tainted, values } = resolveVars(declarations, {}, evaluate);
    expect(tainted.has("key")).toBe(true);
    expect(tainted.has("q")).toBe(true);
    expect(tainted.has("n")).toBe(false);
    expect(values.q).toBe("?key="); // still computed; presentation decides
  });

  it("reader input overrides the default and clears taint", () => {
    const declarations = decls(["key: Key", 'q := "?key=" + key']);
    const { tainted, values } = resolveVars(declarations, { key: "abc" }, evaluate);
    expect(tainted.size).toBe(0);
    expect(values.q).toBe("?key=abc");
  });

  it("reports cycles instead of spinning", () => {
    const declarations = decls(["a := b + 1", "b := a + 1"]);
    const { errors } = resolveVars(declarations, {}, evaluate);
    expect(errors.a).toContain("circular");
    expect(errors.b).toContain("circular");
  });

  it("reports undeclared references and bad expressions", () => {
    const declarations = decls(["a := nope + 1", "b := .Values.x"]);
    const { errors } = resolveVars(declarations, {}, evaluate);
    expect(errors.a).toContain('undeclared variable "nope"');
    expect(errors.b).toContain("not a valid expression");
  });

  it("propagates errors to dependents without evaluating them", () => {
    const declarations = decls(["a := nope + 1", "b := a + 1"]);
    const { errors, values } = resolveVars(declarations, {}, evaluate);
    expect(errors.b).toContain("depends on a variable with an error");
    expect("b" in values).toBe(false);
  });
});
