// Suggest a docolin project slug from a GitHub repo name. Lowercases,
// collapses runs of non-alphanumeric chars to a single dash, trims
// leading/trailing dashes. No regex per CLAUDE.md 3.8.
//
// Examples:
//   "cuda-docs" -> "cuda-docs"
//   "CUDA Docs" -> "cuda-docs"
//   "my_project.v2" -> "my-project-v2"
//   "---weird---" -> "weird"

export function slugFromRepoName(name: string): string {
  let result = "";
  let prevWasDash = false;
  for (const ch of name.toLowerCase()) {
    const isLower = ch >= "a" && ch <= "z";
    const isDigit = ch >= "0" && ch <= "9";
    if (isLower || isDigit) {
      result += ch;
      prevWasDash = false;
      continue;
    }
    // Treat any other character as a separator. Collapse runs of separators
    // to a single dash and skip leading separators entirely.
    if (!prevWasDash && result.length > 0) {
      result += "-";
      prevWasDash = true;
    }
  }
  while (result.endsWith("-")) result = result.slice(0, -1);
  return result;
}
