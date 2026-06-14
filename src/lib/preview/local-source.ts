// Abstracts the two ways a local docs folder reaches the browser: the File
// System Access API (Chromium, live and re-readable) and a one-shot
// `<input webkitdirectory>` upload (Firefox/Safari, a snapshot). Both expose
// the same read interface so the importer is source-agnostic. Paths are
// repo-root-relative, forward-slash, no leading slash, matching what the sync
// pipeline (isDocoFile, the sitemap cascade) expects.

export interface LocalFileSource {
  // Whether the source can be re-read after the files change on disk: true for
  // the File System Access API, false for an upload snapshot.
  readonly live: boolean;
  // Repo-root-relative paths under `subpath` (the whole folder when null). The
  // FS-handle source walks ONLY that subtree, so pointing at a deep docs folder
  // never reads the rest of the repo.
  listFiles(subpath: string | null): Promise<string[]>;
  // A file's UTF-8 text, or null if it's no longer there.
  readText(path: string): Promise<string | null>;
  // A file as a Blob (for images), or null if it's gone.
  readBlob(path: string): Promise<Blob | null>;
}

// --- File System Access API (Chromium): live, re-readable ---

export class DirectoryHandleSource implements LocalFileSource {
  readonly live = true;
  readonly root: FileSystemDirectoryHandle;

  constructor(root: FileSystemDirectoryHandle) {
    this.root = root;
  }

  async listFiles(subpath: string | null): Promise<string[]> {
    const parts = (subpath ?? "").split("/").filter((p) => p.length > 0);
    let dir = this.root;
    try {
      for (const part of parts) dir = await dir.getDirectoryHandle(part);
    } catch {
      return []; // the chosen docs folder doesn't exist in this picked folder
    }
    const out: string[] = [];
    await walkDir(dir, parts.join("/"), out);
    return out;
  }

  async readText(path: string): Promise<string | null> {
    const handle = await this.fileHandleFor(path);
    if (handle === null) return null;
    return (await handle.getFile()).text();
  }

  async readBlob(path: string): Promise<Blob | null> {
    const handle = await this.fileHandleFor(path);
    if (handle === null) return null;
    return await handle.getFile();
  }

  private async fileHandleFor(path: string): Promise<FileSystemFileHandle | null> {
    const parts = path.split("/").filter((p) => p.length > 0);
    if (parts.length === 0) return null;
    let dir = this.root;
    // getDirectoryHandle / getFileHandle reject when a segment is missing; a
    // dangling link (e.g. a deleted target) is "no such file", not an error.
    try {
      for (let i = 0; i < parts.length - 1; i++) {
        dir = await dir.getDirectoryHandle(parts[i]);
      }
      return await dir.getFileHandle(parts[parts.length - 1]);
    } catch {
      return null;
    }
  }
}

// Skip heavy / irrelevant directories so walking a repo root doesn't read tens
// of thousands of files (node_modules etc.) and take 30+ seconds. Hidden dirs
// (.git, .svelte-kit, ...) are skipped too.
const IGNORED_DIRS = new Set(["node_modules", "dist", "build", "out", "coverage", "vendor"]);

export function isIgnoredDir(name: string): boolean {
  return name.startsWith(".") || IGNORED_DIRS.has(name);
}

async function walkDir(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  out: string[],
): Promise<void> {
  for await (const entry of dir.values()) {
    const path = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
    if (entry.kind === "file") {
      out.push(path);
    } else if (!isIgnoredDir(entry.name)) {
      await walkDir(entry, path, out);
    }
  }
}

// --- Uploaded folder snapshot (Firefox/Safari): one-shot, no live reload ---

export class UploadedFilesSource implements LocalFileSource {
  readonly live = false;
  private readonly files = new Map<string, File>();

  constructor(files: File[]) {
    for (const file of files) {
      // webkitRelativePath is "<pickedFolderName>/a/b.md"; strip the leading
      // folder segment so paths are repo-root-relative like the FS-handle source.
      const rel = stripFirstSegment(file.webkitRelativePath);
      // Skip node_modules / hidden dirs so a repo-root upload stays cheap.
      if (rel.length === 0 || rel.split("/").some(isIgnoredDir)) continue;
      this.files.set(rel, file);
    }
  }

  listFiles(subpath: string | null): Promise<string[]> {
    const keys = [...this.files.keys()];
    if (subpath === null || subpath.length === 0) return Promise.resolve(keys);
    const prefix = `${subpath}/`;
    return Promise.resolve(keys.filter((k) => k.startsWith(prefix)));
  }

  readText(path: string): Promise<string | null> {
    const file = this.files.get(path);
    return file === undefined ? Promise.resolve(null) : file.text();
  }

  readBlob(path: string): Promise<Blob | null> {
    return Promise.resolve(this.files.get(path) ?? null);
  }
}

function stripFirstSegment(path: string): string {
  const slash = path.indexOf("/");
  return slash === -1 ? "" : path.slice(slash + 1);
}
