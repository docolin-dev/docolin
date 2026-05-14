import type { Handle } from "@sveltejs/kit";
import { authService } from "$lib/server/auth";

export const handle: Handle = async ({ event, resolve }) => {
  const { auth, refreshedSessionData } = await authService.withAuth(event.request);
  event.locals.auth = auth;

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
