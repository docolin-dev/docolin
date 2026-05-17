// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { AuthResult } from "@workos/authkit-session";
import type { DbOrg, DbUser } from "$lib/server/users";

declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      auth: AuthResult;
      // null when the visitor is anonymous or WorkOS-authed but hasn't
      // completed onboarding (no row in our users table yet).
      dbUser: DbUser | null;
      personalOrg: DbOrg | null;
    }
    // Shape exposed to the client by +layout.server.ts. Lives in PageData so
    // shared components like the navbar can read `page.data.auth` /
    // `page.data.dbUser` with full typing.
    interface PageData {
      auth: { email: string } | null;
      dbUser: {
        handle: string;
        displayName: string | null;
        isPlatformAdmin: boolean;
      } | null;
      inboxUnreadCount: number;
    }
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
