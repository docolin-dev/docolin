// Shared JSON-LD emitter. Pages build a structured-data object and inject the
// returned string via {@html ...} in <svelte:head>. Kept in one place so every
// surface escapes user-controlled content identically.

/** Serializes a value to a `<script type="application/ld+json">` string for
 *  injection in a document head. Escapes `<` to its JSON unicode escape so
 *  user-controlled content (doco titles, author names, kind labels) can never
 *  close the script tag or open a new one. `<` is the only character that can
 *  break out of a raw `<script>` context; JSON.stringify already escapes quotes
 *  and control characters, so escaping it is sufficient and keeps valid JSON. */
export function ldJsonScript(value: unknown): string {
  const json = JSON.stringify(value).split("<").join("\\u003c");
  return `<script type="application/ld+json">${json}</script>`;
}
