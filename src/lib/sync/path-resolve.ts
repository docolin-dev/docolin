// Resolves a relative path against a base file path, mirroring how a browser
// resolves a relative URL against the current document. Used by the image and
// link rewriters to absolutize "./foo.png" and "../sibling.md" forms.
//
// No regex per CLAUDE.md 3.8. Plain string slicing.

export function resolveRelativePath(basePath: string, relative: string): string {
  // The base file's directory: everything up to but not including the last "/".
  const lastSlash = basePath.lastIndexOf("/");
  const baseDir = lastSlash >= 0 ? basePath.slice(0, lastSlash) : "";

  const parts: string[] = [];
  for (const segment of baseDir.split("/")) {
    if (segment.length > 0) parts.push(segment);
  }

  for (const segment of relative.split("/")) {
    if (segment.length === 0 || segment === ".") continue;
    if (segment === "..") {
      parts.pop();
    } else {
      parts.push(segment);
    }
  }

  return parts.join("/");
}

// True for paths that should be resolved against the base file path:
// "./foo", "../bar", or "baz/qux" (bare relative). False for absolute paths
// ("/foo"), external URLs ("https://..."), and other schemes.
export function isRelativePath(url: string): boolean {
  if (url.length === 0) return false;
  if (url.startsWith("./") || url.startsWith("../")) return true;
  if (url.startsWith("/")) return false;
  if (url.startsWith("#")) return false;
  if (url.startsWith("mailto:")) return false;
  if (url.startsWith("http://") || url.startsWith("https://")) return false;
  // Any other ":" indicates a scheme (data:, ftp:, etc.).
  if (url.includes(":")) return false;
  return true;
}
