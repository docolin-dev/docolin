import type { LayoutServerLoad } from "./$types";

// Expose just the safe slices of locals to the client so components like the
// navbar can switch between anonymous / authed-not-onboarded / onboarded
// states. Email and handle are user-facing, the rest stays server-side.
export const load: LayoutServerLoad = ({ locals }) => {
  return {
    auth: locals.auth.user
      ? {
          email: locals.auth.user.email,
        }
      : null,
    dbUser: locals.dbUser
      ? {
          handle: locals.dbUser.handle,
          displayName: locals.dbUser.displayName,
        }
      : null,
  };
};
