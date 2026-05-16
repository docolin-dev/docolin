import type { Handle } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";
import { authService } from "$lib/server/auth";
import { findUserByWorkosId } from "$lib/server/users";
import { paraglideMiddleware } from "$paraglide/server";

// Paraglide reads the locale from the URL (default URL pattern: /de/* for DE,
// root for EN) and sets it in async-local storage for SSR so message functions
// resolve to the right locale per request. The `%paraglide.lang%` placeholder
// in app.html gets replaced with the active locale.
const paraglideHandle: Handle = ({ event, resolve }) =>
  paraglideMiddleware(event.request, ({ request: localizedRequest, locale }) => {
    event.request = localizedRequest;
    return resolve(event, {
      transformPageChunk: ({ html }) => html.replace("%paraglide.lang%", locale),
    });
  });

const authHandle: Handle = async ({ event, resolve }) => {
  const { auth, refreshedSessionData } = await authService.withAuth(event.request);
  event.locals.auth = auth;

  // Resolve our own DB user/org on every authed request so every route can
  // distinguish "WorkOS-authed only" from "fully onboarded" without its own
  // DB query. One per-request select; cheap.
  if (auth.user) {
    const lookup = await findUserByWorkosId(auth.user.id);
    event.locals.dbUser = lookup?.user ?? null;
    event.locals.personalOrg = lookup?.personalOrg ?? null;
  } else {
    event.locals.dbUser = null;
    event.locals.personalOrg = null;
  }

  let response = await resolve(event);

  if (refreshedSessionData) {
    const { headers } = await authService.saveSession(undefined, refreshedSessionData);
    const setCookie = headers?.["Set-Cookie"] ?? headers?.["set-cookie"];
    if (setCookie) {
      response = new Response(response.body, response);
      for (const value of Array.isArray(setCookie) ? setCookie : [setCookie]) {
        response.headers.append("Set-Cookie", value);
      }
    }
  }

  return response;
};

export const handle = sequence(paraglideHandle, authHandle);
