// Checks that every locale's message file carries exactly the base locale's keys
// (no missing, no extra) and that each message uses the same {placeholder} set as
// the base, so a locale can never silently fall back to English or drop a value.
// Wired into `check` / `check:fast` next to check-no-dashes.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MESSAGES_DIR = "messages";
const BASE_LOCALE = "en";

// The {param} names of one message, by brace scanning (no regex).
function placeholders(message: string): string[] {
  const names: string[] = [];
  let from = 0;
  while (true) {
    const open = message.indexOf("{", from);
    if (open === -1) break;
    const close = message.indexOf("}", open + 1);
    if (close === -1) break;
    names.push(message.slice(open + 1, close));
    from = close + 1;
  }
  return names.sort();
}

function loadLocale(file: string): Record<string, string> {
  const parsed: unknown = JSON.parse(readFileSync(join(MESSAGES_DIR, file), "utf8"));
  if (parsed === null || typeof parsed !== "object") throw new Error(`${file}: not an object`);
  const messages: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (key === "$schema") continue;
    if (typeof value !== "string") throw new Error(`${file}: "${key}" is not a string`);
    messages[key] = value;
  }
  return messages;
}

const files = readdirSync(MESSAGES_DIR)
  .filter((file) => file.endsWith(".json"))
  .sort();
const base = loadLocale(`${BASE_LOCALE}.json`);
const baseKeys = Object.keys(base);

let problems = 0;
function report(message: string): void {
  console.error(message);
  problems++;
}

for (const file of files) {
  if (file === `${BASE_LOCALE}.json`) continue;
  const locale = loadLocale(file);
  for (const key of baseKeys) {
    if (!(key in locale)) report(`${file}: missing "${key}"`);
  }
  for (const key of Object.keys(locale)) {
    if (!(key in base)) report(`${file}: extra "${key}" (not in ${BASE_LOCALE}.json)`);
  }
  for (const key of baseKeys) {
    const translated = locale[key];
    if (translated === undefined) continue;
    const expected = placeholders(base[key]).join(",");
    const actual = placeholders(translated).join(",");
    if (expected !== actual) {
      report(`${file}: "${key}" placeholders {${actual}} do not match base {${expected}}`);
    }
  }
}

if (problems > 0) {
  console.error(`\n${String(problems)} message problem(s) across ${String(files.length)} locales.`);
  process.exit(1);
}
console.log(`messages in sync: ${String(baseKeys.length)} keys x ${String(files.length)} locales`);
