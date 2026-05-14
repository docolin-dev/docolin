import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { authService } from "$lib/server/auth";

export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.auth.user) {
    redirect(302, "/");
  }

  const returnTo = new URL("/", url.origin).toString();
  const { logoutUrl, headers } = await authService.signOut(locals.auth.sessionId, { returnTo });

  const response = new Response(null, {
    status: 302,
    headers: { Location: logoutUrl },
  });

  const setCookie = headers?.["Set-Cookie"] ?? headers?.["set-cookie"];
  if (setCookie) {
    for (const value of Array.isArray(setCookie) ? setCookie : [setCookie]) {
      response.headers.append("Set-Cookie", value);
    }
  }

  return response;
};
