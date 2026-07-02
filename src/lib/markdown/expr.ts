import jsep from "jsep";
import {
  parseColor,
  formatHex,
  formatRgb,
  formatHsl,
  formatOklch,
  colorKind,
  formatAs,
  toOklchParts,
  fromOklchParts,
  srgbToLinear,
  type Rgba,
  type ColorKind,
} from "./color-convert.ts";
import {
  parseIsoDate,
  formatIsoDate,
  parseDateUnit,
  addToDate,
  diffDays,
  isoWeekday,
  isoToday,
  type IsoDate,
} from "./dates.ts";

// docomd's expression engine: the `{{ expr }}` half of interactive variables.
// jsep produces the AST (battle-tested lexing, number/string literals, and
// precedence); the evaluator below is fully owned and DEFAULT-DENY, because
// every known escape in this problem space (expr-eval CVE-2025-12735, mathjs
// GHSA-jvff-x2qm-6286, AngularJS deleting its sandbox) was an evaluator escape,
// not a parse bug. Expressions run on every reader's client and a hostile doco
// author is in the threat model, so the rules are strict:
//
// - Only scalars (string | number | boolean) exist. No objects, no arrays.
// - No property access of any kind: MemberExpression is denied, so there is no
//   path to `constructor`, `__proto__`, or any prototype chain.
// - Calls only to the fixed allowlist below, by bare name.
// - No loops and no exponentiation, so total work is linear in input length;
//   the caps are defensive, not load-bearing.
// - Scope and function tables are null-prototype maps, so inherited keys like
//   `constructor` can never resolve (a plain object leaks the live Object
//   constructor through `in` + index access).
//
// SECURITY: jsep is pinned to an exact version (package.json, no caret) and its
// config below is module-global. A jsep upgrade is a security-relevant change:
// new node types it may emit are refused by the default-deny walker, but the
// allowlist must be re-audited against its changelog anyway.

// Trim jsep to the docomd grammar: no bitwise/shift operators, no `~`. Parens,
// ternary, `&&`/`||`, comparisons, and arithmetic are jsep defaults. `===` and
// `!==` stay as aliases of `==`/`!=` (authors type them out of JS habit; both
// are the same strict comparison here).
for (const op of ["|", "^", "&", "<<", ">>", ">>>"]) jsep.removeBinaryOp(op);
jsep.removeUnaryOp("~");

/** The only value kind expressions know. NaN/Infinity propagate as numbers;
 *  presentation (error chip vs text) is the render layer's call. */
export type ExprValue = string | number | boolean;

// Bounds. Work is O(input length) by construction (no iteration constructs),
// so these are belt-and-suspenders against pathological inputs, not a gas meter.
const MAX_INPUT_LENGTH = 1024;
const MAX_AST_DEPTH = 48;
const MAX_CALL_ARGS = 8;
const MAX_OUTPUT_LENGTH = 10_000;

// The allowlisted functions: total, pure, deterministic, bounded. Null-prototype
// map so no inherited key is callable.
const FUNCS: Record<string, (...args: ExprValue[]) => ExprValue> = Object.assign(
  Object.create(null) as Record<string, (...args: ExprValue[]) => ExprValue>,
  {
    round: (x: ExprValue, digits: ExprValue = 0): number => {
      // Clamp digits so 10 ** digits can't overflow to Infinity.
      const d = Math.max(-12, Math.min(12, Math.trunc(Number(digits))));
      const p = 10 ** d;
      return Math.round(Number(x) * p) / p;
    },
    min: (...xs: ExprValue[]): number => {
      if (xs.length === 0) throw new Error("min() needs at least one argument");
      return Math.min(...xs.map(Number));
    },
    max: (...xs: ExprValue[]): number => {
      if (xs.length === 0) throw new Error("max() needs at least one argument");
      return Math.max(...xs.map(Number));
    },
    abs: (x: ExprValue): number => Math.abs(Number(x)),
    floor: (x: ExprValue): number => Math.floor(Number(x)),
    ceil: (x: ExprValue): number => Math.ceil(Number(x)),
    sqrt: (x: ExprValue): number => Math.sqrt(Number(x)),
    clamp: (x: ExprValue, lo: ExprValue, hi: ExprValue): number =>
      Math.min(Math.max(Number(x), Number(lo)), Number(hi)),
    upper: (s: ExprValue): string => String(s).toUpperCase(),
    lower: (s: ExprValue): string => String(s).toLowerCase(),
    trim: (s: ExprValue): string => String(s).trim(),
    capitalize: (s: ExprValue): string => {
      const str = String(s);
      return str.length === 0 ? str : str[0].toUpperCase() + str.slice(1);
    },
    length: (s: ExprValue): number => String(s).length,
    contains: (s: ExprValue, sub: ExprValue): boolean => String(s).includes(String(sub)),
    // Plain string replace (replaceAll), never a regex, so no ReDoS. The output
    // cap in evaluateExpression bounds any growth from a large replacement.
    replace: (s: ExprValue, find: ExprValue, repl: ExprValue): string =>
      String(find).length === 0 ? String(s) : String(s).replaceAll(String(find), String(repl)),
    slice: (s: ExprValue, start: ExprValue, end: ExprValue = NaN): string => {
      const str = String(s);
      const from = Math.trunc(Number(start));
      return Number.isNaN(Number(end)) ? str.slice(from) : str.slice(from, Math.trunc(Number(end)));
    },
    startswith: (s: ExprValue, prefix: ExprValue): boolean => String(s).startsWith(String(prefix)),
    endswith: (s: ExprValue, suffix: ExprValue): boolean => String(s).endsWith(String(suffix)),
    // Padding for lining up config columns; target length clamped so it can't
    // become a memory lever.
    padstart: (s: ExprValue, len: ExprValue, pad: ExprValue = " "): string =>
      String(s).padStart(clampPad(len), String(pad)),
    padend: (s: ExprValue, len: ExprValue, pad: ExprValue = " "): string =>
      String(s).padEnd(clampPad(len), String(pad)),
    // Reader-locale thousands separators ("50,000" / "50.000") for prose.
    numberformat: (n: ExprValue): string => new Intl.NumberFormat(undefined).format(Number(n)),
    urlencode: (s: ExprValue): string => encodeURIComponent(String(s)),
    // For `Authorization: Basic {{ b64encode(user + ":" + pass) }}`. btoa throws
    // on non-latin1 input; that surfaces as an error chip, which is honest.
    b64encode: (s: ExprValue): string => btoa(String(s)),
    // Color conversions (pure math over the big four formats; an unsupported or
    // malformed color throws, i.e. renders as an error chip).
    tohex: (c: ExprValue): string => formatHex(requireColor(c)),
    torgb: (c: ExprValue): string => formatRgb(requireColor(c)),
    tohsl: (c: ExprValue): string => formatHsl(requireColor(c)),
    tooklch: (c: ExprValue): string => formatOklch(requireColor(c)),
    // Color manipulation in OKLCH (perceptually even steps), emitted back in
    // the same format family the input used, so a derived palette matches the
    // author's style. `amount` is 0..1 of lightness.
    lighten: (c: ExprValue, amount: ExprValue): string => shiftLightness(c, Number(amount)),
    darken: (c: ExprValue, amount: ExprValue): string => shiftLightness(c, -Number(amount)),
    alpha: (c: ExprValue, a: ExprValue): string => {
      const kind = requireColorKind(c);
      const color = requireColor(c);
      return formatAs(kind, { ...color, alpha: Math.min(1, Math.max(0, Number(a))) });
    },
    // Black or white, whichever reads better on the given color (WCAG relative
    // luminance), for "text on your accent" derivations.
    contrast: (c: ExprValue): string => {
      const color = requireColor(c);
      const luminance =
        0.2126 * srgbToLinear(color.r) +
        0.7152 * srgbToLinear(color.g) +
        0.0722 * srgbToLinear(color.b);
      return luminance > 0.179 ? "#000000" : "#ffffff";
    },
    // Calendar math on ISO dates (yyyy-mm-dd), UTC whole days, deterministic.
    today: (): string => frozenToday,
    dateadd: (d: ExprValue, n: ExprValue, unit: ExprValue): string => {
      const parsedUnit = parseDateUnit(String(unit));
      if (parsedUnit === null) {
        throw new Error(`unknown date unit: ${String(unit)} (use days/weeks/months/years)`);
      }
      // A NaN amount would silently emit a garbage date string; an error chip
      // is the honest rendering.
      const amount = Number(n);
      if (!Number.isFinite(amount)) throw new Error(`not an amount: ${String(n)}`);
      return formatIsoDate(addToDate(requireDate(d), amount, parsedUnit));
    },
    datediff: (from: ExprValue, to: ExprValue): number =>
      diffDays(requireDate(from), requireDate(to)),
    weekday: (d: ExprValue): number => isoWeekday(requireDate(d)),
    // Reader-locale long/short date, for prose ("published March 3, 2026").
    dateformat: (d: ExprValue, style: ExprValue = "long"): string => {
      const parsed = requireDate(d);
      const dateStyle = String(style);
      if (
        dateStyle !== "full" &&
        dateStyle !== "long" &&
        dateStyle !== "medium" &&
        dateStyle !== "short"
      ) {
        throw new Error(`unknown date style: ${dateStyle} (use full/long/medium/short)`);
      }
      return new Intl.DateTimeFormat(undefined, { dateStyle, timeZone: "UTC" }).format(
        new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)),
      );
    },
  },
);

function clampPad(len: ExprValue): number {
  return Math.min(200, Math.max(0, Math.trunc(Number(len))));
}

function requireColorKind(value: ExprValue): ColorKind {
  const kind = colorKind(String(value));
  if (kind === null) {
    throw new Error(`not a convertible color: ${String(value)} (use hex, rgb, hsl, or oklch)`);
  }
  return kind;
}

function shiftLightness(c: ExprValue, delta: number): string {
  const kind = requireColorKind(c);
  const color = requireColor(c);
  const { l, c: chroma, h } = toOklchParts(color);
  const shifted = fromOklchParts(Math.min(1, Math.max(0, l + delta)), chroma, h, color.alpha);
  return formatAs(kind, shifted);
}

function requireColor(value: ExprValue): Rgba {
  const color = parseColor(String(value));
  if (color === null) {
    throw new Error(`not a convertible color: ${String(value)} (use hex, rgb, hsl, or oklch)`);
  }
  return color;
}

function requireDate(value: ExprValue): IsoDate {
  const date = parseIsoDate(String(value));
  if (date === null) throw new Error(`not a date: ${String(value)} (use yyyy-mm-dd)`);
  return date;
}

// `today()` is frozen per evaluation pass: the caller (chip updater / resolver)
// passes one value for the whole pass, so every expression on a page agrees on
// the date, and tests inject a fixed day. Module state is safe: JS is
// single-threaded and evaluateExpression sets it on entry, synchronously.
let frozenToday = "1970-01-01";

/** The built-in function names; the declarations layer reserves these so a
 *  variable can never shadow a function. Single source of truth, no drift. */
export const BUILTIN_FUNCTIONS: readonly string[] = Object.keys(FUNCS);

// Comparisons only between same-type operands; JS cross-type coercion is a
// footgun authors should hit as an error, not a wrong answer.
function compare(fn: (a: ExprValue, b: ExprValue) => boolean) {
  return (a: ExprValue, b: ExprValue): boolean => {
    if (typeof a !== typeof b) {
      throw new Error(`cannot compare ${typeof a} with ${typeof b}`);
    }
    return fn(a, b);
  };
}

const BINOPS: Record<string, (a: ExprValue, b: ExprValue) => ExprValue> = Object.assign(
  Object.create(null) as Record<string, (a: ExprValue, b: ExprValue) => ExprValue>,
  {
    // `+` concatenates when either side is a string, else adds numerically.
    "+": (a: ExprValue, b: ExprValue): ExprValue =>
      typeof a === "string" || typeof b === "string"
        ? String(a) + String(b)
        : Number(a) + Number(b),
    "-": (a: ExprValue, b: ExprValue): number => Number(a) - Number(b),
    "*": (a: ExprValue, b: ExprValue): number => Number(a) * Number(b),
    "/": (a: ExprValue, b: ExprValue): number => Number(a) / Number(b),
    "%": (a: ExprValue, b: ExprValue): number => Number(a) % Number(b),
    "==": (a: ExprValue, b: ExprValue): boolean => a === b,
    "!=": (a: ExprValue, b: ExprValue): boolean => a !== b,
    "===": (a: ExprValue, b: ExprValue): boolean => a === b,
    "!==": (a: ExprValue, b: ExprValue): boolean => a !== b,
    "<": compare((a, b) => a < b),
    "<=": compare((a, b) => a <= b),
    ">": compare((a, b) => a > b),
    ">=": compare((a, b) => a >= b),
  },
);

const UNOPS: Record<string, (a: ExprValue) => ExprValue> = Object.assign(
  Object.create(null) as Record<string, (a: ExprValue) => ExprValue>,
  {
    "!": (a: ExprValue): boolean => !a,
    "-": (a: ExprValue): number => -Number(a),
    "+": (a: ExprValue): number => Number(a),
  },
);

// jsep's nodes, viewed structurally: every field optional so each case must
// prove what it uses, and unknown node types fall through to the deny.
interface ExprNode {
  type: string;
  value?: unknown;
  name?: string;
  operator?: string;
  argument?: ExprNode;
  left?: ExprNode;
  right?: ExprNode;
  test?: ExprNode;
  consequent?: ExprNode;
  alternate?: ExprNode;
  callee?: ExprNode;
  arguments?: ExprNode[];
}

function evalNode(node: ExprNode, scope: Record<string, ExprValue>, depth: number): ExprValue {
  if (depth > MAX_AST_DEPTH) throw new Error("expression too deeply nested");
  switch (node.type) {
    case "Literal": {
      const value = node.value;
      if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
        throw new Error("only string, number, and boolean literals are supported");
      }
      return value;
    }
    case "Identifier": {
      // `in` on a null-prototype map: only own (declared) names resolve.
      if (node.name === undefined || !(node.name in scope)) {
        throw new Error(`unknown variable: ${node.name ?? ""}`);
      }
      return scope[node.name];
    }
    case "UnaryExpression": {
      const op = node.operator === undefined ? undefined : UNOPS[node.operator];
      if (op === undefined || node.argument === undefined) {
        throw new Error(`operator not allowed: ${node.operator ?? ""}`);
      }
      return op(evalNode(node.argument, scope, depth + 1));
    }
    case "BinaryExpression":
    case "LogicalExpression": {
      if (node.left === undefined || node.right === undefined) {
        throw new Error("malformed expression");
      }
      // Short-circuit like JS, so the untaken branch never evaluates.
      if (node.operator === "&&") {
        const left = evalNode(node.left, scope, depth + 1);
        return left ? evalNode(node.right, scope, depth + 1) : left;
      }
      if (node.operator === "||") {
        const left = evalNode(node.left, scope, depth + 1);
        return left ? left : evalNode(node.right, scope, depth + 1);
      }
      const op = node.operator === undefined ? undefined : BINOPS[node.operator];
      if (op === undefined) throw new Error(`operator not allowed: ${node.operator ?? ""}`);
      return op(evalNode(node.left, scope, depth + 1), evalNode(node.right, scope, depth + 1));
    }
    case "ConditionalExpression": {
      if (
        node.test === undefined ||
        node.consequent === undefined ||
        node.alternate === undefined
      ) {
        throw new Error("malformed expression");
      }
      return evalNode(node.test, scope, depth + 1)
        ? evalNode(node.consequent, scope, depth + 1)
        : evalNode(node.alternate, scope, depth + 1);
    }
    case "CallExpression": {
      const callee = node.callee;
      if (callee?.type !== "Identifier" || callee.name === undefined) {
        throw new Error("only direct calls to built-in functions are allowed");
      }
      if (!(callee.name in FUNCS)) throw new Error(`unknown function: ${callee.name}`);
      const args = node.arguments ?? [];
      if (args.length > MAX_CALL_ARGS) throw new Error("too many arguments");
      return FUNCS[callee.name](...args.map((arg) => evalNode(arg, scope, depth + 1)));
    }
    // MemberExpression, ArrayExpression, Compound, ThisExpression, and any node
    // type a future jsep emits all land here: DEFAULT-DENY.
    default:
      throw new Error(`expression element not allowed: ${node.type}`);
  }
}

/** Evaluates one docomd expression over the given variables. Throws on any
 *  disallowed construct or malformed input; the caller renders the error (an
 *  inline error chip / preview problem), it never surfaces as a crash. `vars`
 *  must hold scalars only; the declarations layer guarantees that. `todayIso`
 *  freezes `today()`: pass one value for a whole update pass (tests pass a
 *  fixed date); omitted, it snapshots the local calendar day per call. */
export function evaluateExpression(
  expr: string,
  vars: Record<string, ExprValue>,
  todayIso?: string,
): ExprValue {
  frozenToday = todayIso ?? isoToday();
  if (expr.length > MAX_INPUT_LENGTH) throw new Error("expression too long");
  // Null-prototype copy: inherited keys (`constructor`, `toString`, ...) can
  // never resolve as variables.
  const scope = Object.assign(Object.create(null) as Record<string, ExprValue>, vars);
  const ast = jsep(expr) as unknown as ExprNode;
  const out = evalNode(ast, scope, 0);
  if (typeof out === "string" && out.length > MAX_OUTPUT_LENGTH) {
    throw new Error("result too long");
  }
  return out;
}

/** The bare variable names an expression reads, or null when the text is not a
 *  docomd expression: it fails to parse, OR any node of its AST falls outside
 *  the evaluable grammar (jsep parses Helm-ish text like `- if .Values.x` into
 *  Compound/Member nodes; those must read as literal text, not as an error).
 *  The render pipeline tags a `{{ }}` candidate only when this returns names
 *  that are all declared, so foreign template syntax survives untouched. */
export function expressionIdentifiers(expr: string): string[] | null {
  if (expr.length > MAX_INPUT_LENGTH) return null;
  let ast: ExprNode;
  try {
    ast = jsep(expr);
  } catch {
    // Not parseable at all; the caller treats the text as literal. jsep gives
    // no throw-free probe.
    return null;
  }
  const names = new Set<string>();
  // Mirrors evalNode's allowlist: returns false the moment any node type the
  // evaluator would deny appears, so "collectable" means "evaluable".
  const walk = (node: ExprNode): boolean => {
    switch (node.type) {
      case "Literal":
        return (
          typeof node.value === "string" ||
          typeof node.value === "number" ||
          typeof node.value === "boolean"
        );
      case "Identifier":
        if (node.name === undefined) return false;
        names.add(node.name);
        return true;
      case "UnaryExpression":
        return node.argument !== undefined && walk(node.argument);
      case "BinaryExpression":
      case "LogicalExpression":
        return (
          node.left !== undefined && node.right !== undefined && walk(node.left) && walk(node.right)
        );
      case "ConditionalExpression":
        return (
          node.test !== undefined &&
          node.consequent !== undefined &&
          node.alternate !== undefined &&
          walk(node.test) &&
          walk(node.consequent) &&
          walk(node.alternate)
        );
      case "CallExpression": {
        // The bare callee is a function name, not a variable; don't collect it.
        const callee = node.callee;
        if (callee?.type !== "Identifier" || callee.name === undefined) {
          return false;
        }
        if (!(callee.name in FUNCS)) return false;
        return (node.arguments ?? []).every((arg) => walk(arg));
      }
      default:
        return false;
    }
  };
  return walk(ast) ? [...names] : null;
}
