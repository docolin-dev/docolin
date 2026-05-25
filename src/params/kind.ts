import type { ParamMatcher } from "@sveltejs/kit";
import { TAXONOMY_ROOTS } from "$lib/reserved-handles";

// Matches a first URL segment that is a taxonomy root (os, hardware, tools, ...).
// This is how `/tools/docolin` routes to the kind browse page instead of the
// org/project viewer: taxonomy roots are reserved and can never be org handles,
// so claiming them for kind pages is unambiguous.
export const match: ParamMatcher = (param) => TAXONOMY_ROOTS.has(param);
