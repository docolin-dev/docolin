import {
  resolveVars,
  type VarDeclaration,
  type InputDeclaration,
  type ResolvedVars,
} from "$lib/markdown/inputs";
import { evaluateExpression } from "$lib/markdown/expr";

// The one reactive source of truth for a page's interactive variables. Every
// mounted inputs card reads and writes it (Svelte 5 runes, so their fields and
// derived rows update live), and the DOM-side chip updater subscribes through
// `onChange` (the `{{ }}` markers are server-rendered spans, thousands
// potentially, so they update by textContent writes, not by mounting
// components). Values NEVER leave the client: resolution is local, persistence
// is localStorage, and secret inputs are excluded even from that.

const STORAGE_PREFIX = "docolin:vars:";

function emptyResolution(): ResolvedVars {
  return { values: {}, tainted: new Set(), errors: {} };
}

export class VarsStore {
  /** All declarations on the page, in document order across cards. Static. */
  readonly declarations: readonly VarDeclaration[];
  /** Raw input values as typed by the reader (or restored from storage). */
  inputValues = $state<Record<string, string>>({});
  resolved = $state<ResolvedVars>(emptyResolution());

  private readonly storageKey: string;
  private readonly inputs: InputDeclaration[];
  private listeners: (() => void)[] = [];

  constructor(declarations: readonly VarDeclaration[], pageKey: string) {
    this.declarations = declarations;
    this.inputs = declarations.filter((decl) => decl.kind === "input");
    this.storageKey = STORAGE_PREFIX + pageKey;
    this.restore();
    this.resolve();
  }

  /** Registers a change listener (the chip updater); returns an unsubscribe. */
  onChange(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((entry) => entry !== listener);
    };
  }

  setValue(name: string, value: string): void {
    this.inputValues[name] = value;
    this.resolve();
    this.persist();
  }

  /** Clears every value, including anything persisted. */
  reset(): void {
    this.inputValues = {};
    this.resolve();
    // localStorage can throw under strict privacy settings; resetting the live
    // state must still work, so the storage write is best-effort.
    try {
      localStorage.removeItem(this.storageKey);
    } catch {
      /* ignore */
    }
  }

  /** Whether the reader has stored or typed anything worth resetting. */
  get hasValues(): boolean {
    return Object.values(this.inputValues).some((value) => value !== "");
  }

  private resolve(): void {
    this.resolved = resolveVars(this.declarations, this.inputValues, evaluateExpression);
    for (const listener of this.listeners) listener();
  }

  // Non-secret inputs persist per doco, so a revisit keeps the reader's
  // hostname without re-typing. Secrets are memory-only by design.
  private persist(): void {
    const stored: Record<string, string> = {};
    for (const decl of this.inputs) {
      if (decl.secret || !(decl.name in this.inputValues)) continue;
      const value = this.inputValues[decl.name];
      if (value !== "") stored[decl.name] = value;
    }
    try {
      if (Object.keys(stored).length === 0) localStorage.removeItem(this.storageKey);
      else localStorage.setItem(this.storageKey, JSON.stringify(stored));
    } catch {
      /* ignore (see reset) */
    }
  }

  private restore(): void {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(this.storageKey);
    } catch {
      /* ignore (see reset) */
    }
    if (raw === null) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // A corrupt entry (manual edit, old format) must not break the page.
      return;
    }
    if (parsed === null || typeof parsed !== "object") return;
    const values: Record<string, string> = {};
    for (const decl of this.inputs) {
      if (decl.secret) continue;
      const value = (parsed as Record<string, unknown>)[decl.name];
      if (typeof value === "string") values[decl.name] = value;
    }
    this.inputValues = values;
  }
}
