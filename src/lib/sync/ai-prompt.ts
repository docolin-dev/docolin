// Builders for the copy-to-AI prompts shown next to sync file errors.
//
// Why these aren't i18n'd: LLMs work best with English instructions, and
// maintaining long prompt templates in multiple languages is high-cost and
// error-prone. Instead the prompt is always English, prefixed with a one-line
// instruction telling the AI to respond in the user's UI locale. The model
// picks up that cue reliably.

export interface PromptIssue {
  path: string;
  message: string;
}

export interface PromptError {
  filePath: string;
  errorCode: string;
  issues?: PromptIssue[];
}

// Mirrors the localized friendly messages in messages/en.json but lives in
// code so the AI prompt is always English regardless of UI locale. Update
// alongside the i18n keys when the error catalog grows.
const ENGLISH_ERROR_MESSAGES: Record<string, string> = {
  yaml_parse_error: "The YAML frontmatter at the top of the file is malformed.",
  frontmatter_invalid: "Frontmatter is missing required fields or has invalid values.",
  handle_not_found: "One or more author handles don't exist on docolin.",
  fetch_failed: "Couldn't fetch the file content.",
  asset_too_large: "An image is too large to archive.",
  asset_fetch_failed: "Couldn't fetch a referenced image.",
  asset_upload_failed: "Couldn't upload an image to docolin storage.",
};

function englishMessage(code: string): string {
  return ENGLISH_ERROR_MESSAGES[code] ?? "Sync error.";
}

// Resolves a BCP-47 locale to its English language name via Intl.DisplayNames.
// Falls back to a generic phrase when the locale isn't recognized.
function languageName(locale: string): string {
  try {
    const display = new Intl.DisplayNames(["en"], { type: "language" });
    return display.of(locale) ?? "the same language I'm writing in";
  } catch {
    return "the same language I'm writing in";
  }
}

function preamble(locale: string): string {
  return `[Auto-generated prompt from docolin. Please respond in ${languageName(locale)}.]\n\n`;
}

function formatIssues(issues: PromptIssue[] | undefined): string {
  if (issues === undefined || issues.length === 0) return "";
  const lines = issues.map((i) => `- ${i.path.length > 0 ? i.path : "(root)"}: ${i.message}`);
  return `\n\nSpecific issues (Zod validation, path: message):\n${lines.join("\n")}`;
}

const CONTEXT_BLOCK = `Context: docolin syncs Markdown docs from a git repo. Each file must have YAML frontmatter at the top with these fields:

- \`title\` (string)
- \`authors\` (list; each entry is either a handle reference (single field \`handle\` set to a docolin handle) or external attribution (fields \`name\`, optional \`username\`, optional \`url\`))
- \`docolin.schema_version: 1\`
- \`docolin.kind\` (2 to 5 lowercase kebab-case segments; first segment must be one of: os, hardware, software, data, network, security, cloud, devops, programming, tools, blog)
- \`docolin.type\` (one of \`tutorial\`, \`how-to\`, \`reference\`, \`explanation\`)

Reference: https://docolin.com/docolin/docolin/frontmatter-format`;

export function buildPerFilePrompt(error: PromptError, locale: string): string {
  return (
    preamble(locale) +
    `I have a sync error from docolin on file \`${error.filePath}\`.

Error code: \`${error.errorCode}\`
Error message: ${englishMessage(error.errorCode)}${formatIssues(error.issues)}

${CONTEXT_BLOCK}

What's the most likely fix? Here's the current file content:

[paste your file]`
  );
}

export function buildAllErrorsPrompt(errors: PromptError[], locale: string): string {
  const items = errors
    .map(
      (e) =>
        `File: \`${e.filePath}\`
Error code: \`${e.errorCode}\`
Error message: ${englishMessage(e.errorCode)}${formatIssues(e.issues)}`,
    )
    .join("\n\n");

  return (
    preamble(locale) +
    `I have ${String(errors.length)} sync errors from docolin. Each file below needs a fix.

${items}

${CONTEXT_BLOCK}

For each file, give me the most likely fix. I'll paste file contents as you ask for them.`
  );
}
