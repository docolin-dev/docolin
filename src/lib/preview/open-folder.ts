import { DirectoryHandleSource, UploadedFilesSource, type LocalFileSource } from "./local-source";
import { openSession, type PreviewSession } from "./preview-session";
import { saveProject, saveHandle, mintProjectId, type PreviewProjectMeta } from "./project-store";

// Normalizes a typed docs-folder path: trims slashes and blank segments, so
// "docs/", "/docs", "" all behave; empty means the whole picked folder (null).
export function normalizeSubpath(input: string): string | null {
  const parts = input.split("/").filter((p) => p.length > 0);
  return parts.length === 0 ? null : parts.join("/");
}

// Persists the project metadata and imports it. `onProgress(done, total)` fires
// per file for the loading bar. The subpath is always chosen explicitly (the
// open modal, a re-open, or the in-preview switcher), so nothing is auto-detected
// and no folder is read before this point.
function persistAndOpen(
  meta: PreviewProjectMeta,
  source: LocalFileSource,
  onProgress?: (done: number, total: number) => void,
): Promise<PreviewSession> {
  saveProject(meta);
  return openSession(meta, source, onProgress);
}

// showDirectoryPicker isn't in the standard DOM lib types yet.
interface DirectoryPickerWindow {
  showDirectoryPicker(opts?: { mode?: "read" | "readwrite" }): Promise<FileSystemDirectoryHandle>;
}

// Opens the File System Access folder picker. Returns null if the user
// dismissed it (or it's unavailable).
export async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
  const w = window as unknown as DirectoryPickerWindow;
  try {
    return await w.showDirectoryPicker({ mode: "read" });
  } catch {
    // AbortError when the user cancels the picker; nothing to open.
    return null;
  }
}

// A folder the user has picked but not yet imported. The open modal collects the
// docs subpath, then calls `open` to run the import (which reads only that
// subtree). Nothing is read at pick time.
export interface PendingSource {
  readonly mode: PreviewProjectMeta["mode"];
  readonly name: string;
  open(
    subpath: string | null,
    onProgress?: (done: number, total: number) => void,
  ): Promise<PreviewSession>;
}

// Opens the directory picker and returns a pending source to feed the modal, or
// null if the user dismissed the picker. No files are read yet.
export async function pickDirectoryPending(): Promise<PendingSource | null> {
  const handle = await pickDirectory();
  if (handle === null) return null;
  const id = mintProjectId(handle.name);
  const source = new DirectoryHandleSource(handle);
  return {
    mode: "fs",
    name: handle.name,
    open: async (subpath, onProgress) => {
      // Persist the handle only once the user commits to opening (live reload).
      await saveHandle(id, handle);
      const meta: PreviewProjectMeta = {
        id,
        name: handle.name,
        subpath,
        mode: "fs",
        lastOpenedAt: Date.now(),
      };
      return persistAndOpen(meta, source, onProgress);
    },
  };
}

// Builds a pending source from an uploaded folder snapshot (Firefox/Safari). No
// handle is persisted, so on reload the user must re-upload.
export function uploadPending(files: File[]): PendingSource {
  const name = folderNameOf(files) ?? "folder";
  const id = mintProjectId(name);
  const source = new UploadedFilesSource(files);
  return {
    mode: "upload",
    name,
    open: (subpath, onProgress) => {
      const meta: PreviewProjectMeta = {
        id,
        name,
        subpath,
        mode: "upload",
        lastOpenedAt: Date.now(),
      };
      return persistAndOpen(meta, source, onProgress);
    },
  };
}

// Re-opens an existing project (its handle was lost or permission was revoked)
// by re-picking the folder; the id and subpath are kept.
export async function reopenDirectory(
  meta: PreviewProjectMeta,
  handle: FileSystemDirectoryHandle,
): Promise<PreviewSession> {
  await saveHandle(meta.id, handle);
  return persistAndOpen(
    { ...meta, mode: "fs", lastOpenedAt: Date.now() },
    new DirectoryHandleSource(handle),
  );
}

// Re-uploads a snapshot project after a reload, reusing its id and subpath.
export function reuploadFiles(files: File[], meta: PreviewProjectMeta): Promise<PreviewSession> {
  return persistAndOpen(
    { ...meta, mode: "upload", lastOpenedAt: Date.now() },
    new UploadedFilesSource(files),
  );
}

// Re-imports an open project under a different subpath (the user changed it from
// inside the preview).
export function changeProjectSubpath(
  session: PreviewSession,
  subpath: string | null,
): Promise<PreviewSession> {
  return persistAndOpen({ ...session.meta, subpath, lastOpenedAt: Date.now() }, session.source);
}

// The picked folder's own name, from the first file's webkitRelativePath.
export function folderNameOf(files: File[]): string | null {
  const first = files.find((f) => f.webkitRelativePath.includes("/"));
  return first === undefined ? null : first.webkitRelativePath.split("/")[0];
}
