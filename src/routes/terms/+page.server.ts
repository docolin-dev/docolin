import { redirect } from "@sveltejs/kit";
import { localizeHref } from "$paraglide/runtime";
import type { PageServerLoad } from "./$types";

// The terms of use are a doco now (versioned, discussable, edited like any
// other page), so this well-known short URL just forwards there. Temporary
// (307) while pre-alpha so the canonical can still move; promote to 308 at
// launch. The doco lives in the docolin self-docs project.
export const load: PageServerLoad = () => {
  redirect(307, localizeHref("/docolin/docolin/terms"));
};
