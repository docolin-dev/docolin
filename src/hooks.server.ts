import type { Handle } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";
import { authService } from "$lib/server/auth";
import { createRequestDb, runWithDb } from "$lib/server/db";
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

// Per-request database handle. On Cloudflare a Neon WebSocket connection is
// request-scoped, so open one per request and bind it for the request's
// duration via async-local storage. We do NOT close the pool here: the runtime
// closes request I/O at the end of the invocation, which is *after* any
// `waitUntil` background work (e.g. the sync engine) that still needs it.
// Closing in a finally raced with that background work. Runs before authHandle,
// which queries the DB.
const dbHandle: Handle = ({ event, resolve }) => {
  const { db } = createRequestDb();
  return runWithDb(db, () => resolve(event));
};

export const handle = sequence(paraglideHandle, dbHandle, authHandle);
