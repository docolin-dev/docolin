import jsep from "jsep";

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
    upper: (s: ExprValue): string => String(s).toUpperCase(),
    lower: (s: ExprValue): string => String(s).toLowerCase(),
    trim: (s: ExprValue): string => String(s).trim(),
    urlencode: (s: ExprValue): string => encodeURIComponent(String(s)),
  },
);

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
 *  must hold scalars only; the declarations layer guarantees that. */
export function evaluateExpression(expr: string, vars: Record<string, ExprValue>): ExprValue {
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
