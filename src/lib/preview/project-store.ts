import { openDB, type DBSchema, type IDBPDatabase } from "idb";

// Persists the user's opened preview projects across reloads, locally only,
// nothing ever reaches the server. Project metadata (name, subpath, mode) is
// small and JSON-serializable, so it lives in localStorage; the actual
// FileSystemDirectoryHandle is structured-cloneable but not JSON, so it lives in
// IndexedDB keyed by the same id. Browser-only.

export interface PreviewProjectMeta {
  // `<slugified-folder-name>-<random>`, minted once and kept until removed.
  id: string;
  name: string;
  subpath: string | null;
  // "fs": a File System Access handle is stored in IndexedDB (live reload).
  // "upload": a one-shot snapshot, no handle persisted, re-upload after reload.
  mode: "fs" | "upload";
  lastOpenedAt: number;
  // The last doco path viewed in this project, so the recents list deep-links
  // back to where you left off.
  lastPath?: string;
}

const LS_KEY = "docolin.preview.projects";

export function listProjects(): PreviewProjectMeta[] {
  if (typeof localStorage === "undefined") return [];
  // localStorage can be disabled (private mode) or hold malformed JSON from an
  // older schema; treat any failure as "no saved projects" rather than throwing.
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isProjectMeta).sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
  } catch {
    return [];
  }
}

export function getProject(id: string): PreviewProjectMeta | null {
  return listProjects().find((p) => p.id === id) ?? null;
}

export function saveProject(meta: PreviewProjectMeta): void {
  const others = listProjects().filter((p) => p.id !== meta.id);
  localStorage.setItem(LS_KEY, JSON.stringify([meta, ...others]));
}

export async function removeProject(id: string): Promise<void> {
  localStorage.setItem(LS_KEY, JSON.stringify(listProjects().filter((p) => p.id !== id)));
  await deleteHandle(id);
}

// Remembers the last doco viewed in a project, so the recents list deep-links
// back to it. Cheap call on each render; no-op if the project was removed.
export function setLastPath(id: string, lastPath: string): void {
  const meta = getProject(id);
  if (meta === null || meta.lastPath === lastPath) return;
  saveProject({ ...meta, lastPath });
}

export function mintProjectId(folderName: string): string {
  return `${slugifyFolder(folderName)}-${crypto.randomUUID().split("-")[0]}`;
}

// Lowercase a-z0-9 with single hyphens between runs; no regex (CLAUDE.md 3.8).
function slugifyFolder(name: string): string {
  let out = "";
  for (const c of name.toLowerCase()) {
    if ((c >= "a" && c <= "z") || (c >= "0" && c <= "9")) out += c;
    else if (out.length > 0 && !out.endsWith("-")) out += "-";
  }
  while (out.endsWith("-")) out = out.slice(0, -1);
  return out.length === 0 ? "folder" : out;
}

function isProjectMeta(v: unknown): v is PreviewProjectMeta {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    (o.subpath === null || typeof o.subpath === "string") &&
    (o.mode === "fs" || o.mode === "upload") &&
    typeof o.lastOpenedAt === "number"
  );
}

// --- IndexedDB handle storage (FileSystemDirectoryHandle survives reloads) ---
// A FileSystemDirectoryHandle is structured-cloneable but not JSON, so it can't
// share the localStorage list above. idb wraps IndexedDB in a typed promise API;
// the schema types `get` so no `any` leaks out (the instanceof guard still
// defends against a stale value from an older build).

const IDB_NAME = "docolin-preview";

interface PreviewDB extends DBSchema {
  handles: { key: string; value: FileSystemDirectoryHandle };
}

// Open lazily and reuse the one connection across calls.
let dbPromise: Promise<IDBPDatabase<PreviewDB>> | null = null;
function db(): Promise<IDBPDatabase<PreviewDB>> {
  dbPromise ??= openDB<PreviewDB>(IDB_NAME, 1, {
    upgrade(database) {
      database.createObjectStore("handles");
    },
  });
  return dbPromise;
}

export async function saveHandle(id: string, handle: FileSystemDirectoryHandle): Promise<void> {
  await (await db()).put("handles", handle, id);
}

export async function getHandle(id: string): Promise<FileSystemDirectoryHandle | null> {
  const result = await (await db()).get("handles", id);
  return result instanceof FileSystemDirectoryHandle ? result : null;
}

async function deleteHandle(id: string): Promise<void> {
  await (await db()).delete("handles", id);
}
