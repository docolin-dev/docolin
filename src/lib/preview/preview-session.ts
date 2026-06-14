import { DirectoryHandleSource, type LocalFileSource } from "./local-source";
import { importProject, type ImportedProject } from "./import-project";
import { getProject, getHandle, type PreviewProjectMeta } from "./project-store";

// The in-memory state of one opened preview project: its metadata, the live file
// source, and the parsed index. Cached module-level so navigating between docos
// in a project doesn't re-import.
export interface PreviewSession {
  meta: PreviewProjectMeta;
  source: LocalFileSource;
  project: ImportedProject;
}

const sessions = new Map<string, PreviewSession>();

// Imports a freshly-opened source (from the overview's open / upload flow) and
// caches it, so the render route uses it immediately.
export async function openSession(
  meta: PreviewProjectMeta,
  source: LocalFileSource,
  onProgress?: (done: number, total: number) => void,
): Promise<PreviewSession> {
  const project = await importProject(source, meta.subpath, onProgress);
  const session: PreviewSession = { meta, source, project };
  sessions.set(meta.id, session);
  return session;
}

export function getSession(id: string): PreviewSession | undefined {
  return sessions.get(id);
}

// Re-imports an open session after its files changed on disk (live reload, File
// System Access only). Returns the refreshed session, or null if it can't.
export async function reimportSession(id: string): Promise<PreviewSession | null> {
  const session = sessions.get(id);
  if (session === undefined) return null;
  if (!session.source.live) return null;
  const project = await importProject(session.source, session.meta.subpath);
  const next: PreviewSession = { ...session, project };
  sessions.set(id, next);
  return next;
}

export type ReopenResult =
  | { status: "ok"; session: PreviewSession }
  // No such project in local storage (id typo, or it was removed).
  | { status: "not_found" }
  // The folder must be re-picked: an upload snapshot (not re-readable) or a lost
  // File System Access handle.
  | { status: "need_reopen"; meta: PreviewProjectMeta }
  // The handle is there but the browser needs the user to re-grant read access.
  | { status: "permission"; meta: PreviewProjectMeta };

// Loads a project cold (a deep link or a reload), re-acquiring its File System
// Access handle from IndexedDB and re-granting permission if needed.
export async function reopenSession(id: string): Promise<ReopenResult> {
  const cached = sessions.get(id);
  if (cached !== undefined) return { status: "ok", session: cached };

  const meta = getProject(id);
  if (meta === null) return { status: "not_found" };
  if (meta.mode === "upload") return { status: "need_reopen", meta };

  const handle = await getHandle(id);
  if (handle === null) return { status: "need_reopen", meta };

  const granted = await ensureReadPermission(handle);
  if (!granted) return { status: "permission", meta };

  const session = await openSession(meta, new DirectoryHandleSource(handle));
  return { status: "ok", session };
}

// queryPermission / requestPermission are part of the File System Access API and
// aren't in the standard DOM lib types yet; narrow to what we call.
interface PermissionCapableHandle {
  queryPermission(opts: { mode: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission(opts: { mode: "read" | "readwrite" }): Promise<PermissionState>;
}

async function ensureReadPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const h = handle as unknown as PermissionCapableHandle;
  try {
    if ((await h.queryPermission({ mode: "read" })) === "granted") return true;
    // requestPermission must be called from a user gesture; the render route only
    // reaches here via the user clicking the project, which satisfies that.
    return (await h.requestPermission({ mode: "read" })) === "granted";
  } catch {
    // Some browsers reject requestPermission when it isn't tied to a user gesture
    // (e.g. reached via the focus poll); treat that as not-granted so the UI
    // prompts a re-open instead of the promise rejecting.
    return false;
  }
}
