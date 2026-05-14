// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { AuthResult } from "@workos/authkit-session";

declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      auth: AuthResult;
    }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
