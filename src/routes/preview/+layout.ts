// The whole /preview subtree is client-only: a folder's files live exclusively
// in the browser (File System Access handles in IndexedDB, or uploaded blobs),
// so there is nothing for the server to render. SSR would just emit an empty
// shell to hydrate over, and these pages must never be prerendered or cached.
export const ssr = false;
export const prerender = false;
