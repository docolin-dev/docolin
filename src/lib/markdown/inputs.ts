import { parseAttrs } from "$lib/markdown/docomd";
import { expressionIdentifiers, type ExprValue } from "./expr.ts";

// The declarations model behind `!!! inputs` cards: parsing the card's raw
// declaration lines into typed input / computed-variable declarations, and
// resolving the resulting variable set (dependency order, cycles, taint from
// unfilled inputs). Pure and DOM-free: the render pipeline uses it to build the
// form and decide which `{{ }}` sites substitute, the client re-runs resolution
// on every keystroke, and the preview surfaces its problems. Parsing works on
// RAW source lines (sliced by mdast positions), never on stringified mdast,
// because expressions legitimately contain `*` and `_` that markdown would eat
// as emphasis.

/** A reader-fillable field: `- name: Label { attrs }`. */
export interface InputDeclaration {
  kind: "input";
  name: string;
  label: string;
  /** Validation type; `text` unless the author narrows it. */
  type: "text" | "number" | "url" | "hostname";
  /** Password-masked, memory-only, never persisted. */
  secret: boolean;
  placeholder: string | null;
  /** Raw default as authored; type coercion happens at resolution. */
  defaultValue: string | null;
  /** For type=number: value bounds. */
  min: number | null;
  max: number | null;
  /** Maximum input length, any type. */
  maxlen: number | null;
}

/** A hidden derived value: `- name := expr`. */
export interface ComputedDeclaration {
  kind: "computed";
  name: string;
  expr: string;
}

export type VarDeclaration = InputDeclaration | ComputedDeclaration;

export interface ParsedDeclarations {
  declarations: VarDeclaration[];
  /** Author mistakes, phrased for the preview problems panel / sync warnings. */
  problems: string[];
}

const INPUT_TYPES = new Set(["text", "number", "url", "hostname"]);
const KNOWN_ATTRS = new Set(["secret", "type", "placeholder", "default", "min", "max", "maxlen"]);
// Function names and literals the evaluator owns; declaring them would shadow
// confusingly, so they are reserved.
const RESERVED = new Set([
  "true",
  "false",
  "round",
  "min",
  "max",
  "upper",
  "lower",
  "trim",
  "urlencode",
]);

function isNameStart(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_";
}
function isNameChar(ch: string): boolean {
  return isNameStart(ch) || (ch >= "0" && ch <= "9");
}

/** Whether `text` is a valid variable name: [A-Za-z_][A-Za-z0-9_]* and not
 *  reserved. Dotted or dashed names can never be valid, which is what keeps
 *  Helm/Jinja placeholder syntax permanently out of the feature. */
export function isValidVarName(text: string): boolean {
  if (text.length === 0 || RESERVED.has(text)) return false;
  if (!isNameStart(text[0])) return false;
  for (const ch of text) if (!isNameChar(ch)) return false;
  return true;
}

function parseBound(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function isAsciiPunctuation(ch: string): boolean {
  return (
    (ch >= "!" && ch <= "/") ||
    (ch >= ":" && ch <= "@") ||
    (ch >= "[" && ch <= "`") ||
    (ch >= "{" && ch <= "~")
  );
}

/** Strips CommonMark backslash-escapes (backslash before ASCII punctuation).
 *  Declaration lines are sliced RAW from the source, and both the sync
 *  canonicalizer and the prettier plugin re-serialize markdown, which escapes
 *  `*` and `_` in list-item text; the author wrote `a * b`, so that is what the
 *  expression parser must see. */
export function unescapeMarkdown(text: string): string {
  let out = "";
  let index = 0;
  while (index < text.length) {
    const ch = text[index];
    if (ch === "\\" && index + 1 < text.length && isAsciiPunctuation(text[index + 1])) {
      out += text[index + 1];
      index += 2;
      continue;
    }
    out += ch;
    index += 1;
  }
  return out;
}

/** Parses one declaration line (the raw text of a card's list item, without the
 *  leading `- `). Returns the declaration, or a problem string for the preview. */
export function parseDeclarationLine(line: string): { decl: VarDeclaration } | { problem: string } {
  const text = unescapeMarkdown(line.trim());

  // Computed: `name := expr`.
  const walrus = text.indexOf(":=");
  if (walrus !== -1) {
    const name = text.slice(0, walrus).trim();
    const expr = text.slice(walrus + 2).trim();
    if (!isValidVarName(name)) return { problem: `invalid variable name: "${name}"` };
    if (expr.length === 0) return { problem: `computed variable "${name}" has no expression` };
    return { decl: { kind: "computed", name, expr } };
  }

  // Input: `name: Label { attrs }` (label and attrs both optional).
  const colon = text.indexOf(":");
  if (colon === -1) {
    return { problem: `not a declaration (expected "name: Label" or "name := expr"): "${text}"` };
  }
  const name = text.slice(0, colon).trim();
  if (!isValidVarName(name)) return { problem: `invalid variable name: "${name}"` };

  let rest = text.slice(colon + 1).trim();
  let attrs: ReturnType<typeof parseAttrs> = null;
  const brace = rest.indexOf("{");
  if (brace !== -1) {
    attrs = parseAttrs(rest.slice(brace));
    if (attrs === null) return { problem: `unclosed attribute list on input "${name}"` };
    rest = rest.slice(0, brace).trim();
  }

  // Indexing is typed `string | undefined` so absent attrs read as undefined.
  const props: Record<string, string | undefined> = attrs?.props ?? {};
  for (const key of Object.keys(props)) {
    if (!KNOWN_ATTRS.has(key)) return { problem: `unknown attribute "${key}" on input "${name}"` };
  }
  const type = props.type ?? "text";
  if (!INPUT_TYPES.has(type)) {
    return { problem: `unknown input type "${type}" on input "${name}"` };
  }

  return {
    decl: {
      kind: "input",
      name,
      label: rest.length > 0 ? rest : name,
      type: type as InputDeclaration["type"],
      secret: props.secret === "true",
      placeholder: unwrapAutolink(props.placeholder) ?? null,
      defaultValue: unwrapAutolink(props.default) ?? null,
      min: parseBound(props.min),
      max: parseBound(props.max),
      maxlen: parseBound(props.maxlen),
    },
  };
}

/** Unwraps a GFM autolink. A bare URL in an attr value gets autolinked when the
 *  doc round-trips through the canonicalizer or prettier (default="https://x"
 *  comes back as default="<https://x>"); the author meant the plain URL. */
function unwrapAutolink(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (value.startsWith("<") && value.endsWith(">") && value.includes("://")) {
    return value.slice(1, -1);
  }
  return value;
}

/** Parses a card's declaration lines, deduplicating names (first wins, later
 *  redeclarations become problems, matching the substitution behavior). */
export function parseDeclarations(lines: readonly string[]): ParsedDeclarations {
  const declarations: VarDeclaration[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const result = parseDeclarationLine(line);
    if ("problem" in result) {
      problems.push(result.problem);
      continue;
    }
    if (seen.has(result.decl.name)) {
      problems.push(`variable "${result.decl.name}" is declared twice (the first wins)`);
      continue;
    }
    seen.add(result.decl.name);
    declarations.push(result.decl);
  }
  return { declarations, problems };
}

export type InputProblem = "number" | "min" | "max" | "maxlen" | "url" | "hostname";

/** Validates a filled input against its declared constraints, returning a
 *  problem code (the UI maps codes to localized messages) or null when fine.
 *  An empty value is never a problem here: unfilled is taint, not an error. */
export function validateInputValue(decl: InputDeclaration, raw: string): InputProblem | null {
  if (raw === "") return null;
  if (decl.maxlen !== null && raw.length > decl.maxlen) return "maxlen";
  if (decl.type === "number") {
    const value = Number(raw);
    if (!Number.isFinite(value)) return "number";
    if (decl.min !== null && value < decl.min) return "min";
    if (decl.max !== null && value > decl.max) return "max";
    return null;
  }
  if (decl.type === "url") {
    return URL.canParse(raw) ? null : "url";
  }
  if (decl.type === "hostname") {
    // Letters, digits, dots, and hyphens; no scheme, no path, no port.
    for (const ch of raw) {
      const ok =
        (ch >= "a" && ch <= "z") ||
        (ch >= "A" && ch <= "Z") ||
        (ch >= "0" && ch <= "9") ||
        ch === "." ||
        ch === "-";
      if (!ok) return "hostname";
    }
    return null;
  }
  return null;
}

export interface ResolvedVars {
  /** Every declared name -> its current value. Unfilled inputs contribute ""
   *  (or NaN for type=number); computed values are evaluated in dependency
   *  order. A computed var whose expression failed is absent here. */
  values: Record<string, ExprValue>;
  /** Names whose value derives (transitively) from an unfilled input; their
   *  `{{ }}` chips render as placeholders, not as half-baked results. */
  tainted: Set<string>;
  /** Computed-variable evaluation errors, by name (bad expression, cycle, or a
   *  reference to an undeclared name), phrased for the author. */
  errors: Record<string, string>;
}

/** Coerces an input's raw string by its declared type. */
function coerceInput(decl: InputDeclaration, raw: string): ExprValue {
  return decl.type === "number" ? Number(raw) : raw;
}

/**
 * Resolves the whole variable set: inputs coerced from `inputValues` (falling
 * back to declared defaults), then computed variables evaluated in dependency
 * order with cycles and undeclared references reported as errors. Evaluation is
 * injected so this module stays dependency-light and the caller controls it
 * (the client passes evaluateExpression; tests can pass fakes).
 */
export function resolveVars(
  declarations: readonly VarDeclaration[],
  inputValues: Readonly<Record<string, string>>,
  evaluate: (expr: string, vars: Record<string, ExprValue>) => ExprValue,
): ResolvedVars {
  const values: Record<string, ExprValue> = {};
  const tainted = new Set<string>();
  const errors: Record<string, string> = {};
  const declared = new Set(declarations.map((decl) => decl.name));

  for (const decl of declarations) {
    if (decl.kind !== "input") continue;
    // A typed value (even a cleared field) wins; the default fills only a field
    // the reader never touched.
    const raw = decl.name in inputValues ? inputValues[decl.name] : (decl.defaultValue ?? "");
    values[decl.name] = coerceInput(decl, raw);
    if (raw === "") tainted.add(decl.name);
  }

  // Dependency edges: computed name -> the declared names its expression reads.
  const deps = new Map<string, string[]>();
  const pending = new Map<string, ComputedDeclaration>();
  for (const decl of declarations) {
    if (decl.kind !== "computed") continue;
    const identifiers = expressionIdentifiers(decl.expr);
    if (identifiers === null) {
      errors[decl.name] = `"${decl.name}" is not a valid expression`;
      tainted.add(decl.name);
      continue;
    }
    const undeclared = identifiers.filter((id) => !declared.has(id));
    if (undeclared.length > 0) {
      errors[decl.name] = `"${decl.name}" references undeclared variable "${undeclared[0]}"`;
      tainted.add(decl.name);
      continue;
    }
    deps.set(decl.name, identifiers);
    pending.set(decl.name, decl);
  }

  // Evaluate in dependency order: repeatedly take any pending computed whose
  // dependencies are all resolved (inputs, or already-evaluated computed).
  // Anything left at the end sits on a cycle.
  let progressed = true;
  while (progressed && pending.size > 0) {
    progressed = false;
    for (const [name, decl] of pending) {
      const wants = deps.get(name) ?? [];
      if (!wants.every((dep) => dep in values || dep in errors)) continue;
      pending.delete(name);
      progressed = true;
      if (wants.some((dep) => dep in errors)) {
        errors[name] = `"${name}" depends on a variable with an error`;
        tainted.add(name);
        continue;
      }
      if (wants.some((dep) => tainted.has(dep))) tainted.add(name);
      // The evaluator throws by design on anything outside the grammar; that is
      // an author error to display, not a crash, so this boundary catches it.
      try {
        values[name] = evaluate(decl.expr, values);
      } catch (error) {
        errors[name] = error instanceof Error ? error.message : String(error);
        tainted.add(name);
      }
    }
  }
  for (const name of pending.keys()) {
    errors[name] = `"${name}" is part of a circular definition`;
    tainted.add(name);
  }

  return { values, tainted, errors };
}
