import {
  getDocoContent,
  buildDocoMarkdown,
  getDiscussionMarkdown,
  docoUrlPath,
} from "$lib/server/doco-content";
import { resolveProjectBySlug, resolveDocoIdentity } from "$lib/server/doco-resolve";
import { listThreads, type ThreadFilter } from "$lib/server/discussions";
import { recordStamp } from "$lib/verification/ingest";
import { signVoteToken, verifyVoteToken } from "./vote-token";
import { rebuildPathInSource, discussionRef } from "$lib/doco-urls";

// MCP tool definitions + implementations. The search family delegates to the
// cacheable GET /api/search (one DTO, edge cache for repeats); fetch and
// list_discussions read in-process. Each tool returns a plain object that the
// server JSON-stringifies into a text content block (the connector convention).

export interface ToolContext {
  /** The request event's fetch, for internal same-origin calls to /api/search. */
  fetch: typeof fetch;
  /** The authenticated user id when a personal MCP token was presented, else
   * null. Drives whether a verification stamp is attributed to an account. */
  userId: string | null;
  /** Request origin (scheme + host). Result URLs (doco url, verifyUrl) are built
   * from it so they point at the serving instance: localhost in dev, the
   * canonical host in production (where origin equals the canonical URL). */
  origin: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const stringArray = { type: "array", items: { type: "string" } };

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "lookup",
    description:
      "Fast, cheap, cacheable keyword search over docolin docos (exact terms, commands, error strings, names); try it first. It matches ALL the words you pass (AND), so give only the distinguishing keywords, never a full sentence, because a natural-language question over-narrows it and returns little or nothing. If it comes back empty, drop words or switch to search. Returns ranked docos with id + url for fetch.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Distinguishing keywords only (command, package, error string, doco name), never a sentence. All words must match.",
        },
        kind: { type: "string", description: "Optional topic path filter, e.g. os/linux." },
        applies_to: { ...stringArray, description: "Optional setup tags to boost (ubuntu, ...)." },
        limit: { type: "number", description: "Max results (default 8)." },
      },
      required: ["query"],
    },
  },
  {
    name: "search",
    description:
      "Semantic (hybrid) search for conceptual or natural-language questions; a full-sentence question works well here, unlike lookup. Costlier than lookup; reach for it when lookup's keywords miss or the query is vague. Returns ranked docos with older verified versions as alternates.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "A natural-language question or concept." },
        kind: { type: "string", description: "Optional topic path filter, e.g. os/linux." },
        applies_to: { ...stringArray, description: "Optional setup tags to boost." },
        limit: { type: "number", description: "Max results (default 8)." },
      },
      required: ["query"],
    },
  },
  {
    name: "browse_kind",
    description:
      "List docos under a topic path (the kinds taxonomy, e.g. os/linux/firewall) plus its subtopics. Pass the user's setup as applies_to to surface what fits their system (soft-link resolution).",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", description: "Topic path, e.g. os/linux or hardware/gpu." },
        applies_to: {
          ...stringArray,
          description: "Setup tags to rank by (ubuntu, wayland, ...).",
        },
        limit: { type: "number", description: "Max results (default 20)." },
      },
      required: ["kind"],
    },
  },
  {
    name: "fetch",
    description:
      "Get the full markdown of a doco or a discussion thread by its id/url (the id field from search/lookup/list_discussions results). Returns the content plus attribution metadata you MUST cite.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "A doco or discussion id/url from a prior result." },
      },
      required: ["id"],
    },
  },
  {
    name: "list_discussions",
    description:
      "List the community discussions (Q&A, fixes, caveats) attached to a doco. Check these when a doco does not fully cover the user's case before falling back to general knowledge.",
    inputSchema: {
      type: "object",
      properties: {
        doco: { type: "string", description: "A doco id/url from a prior result." },
        status: {
          type: "string",
          enum: ["open", "closed", "all"],
          description: "Filter (default open).",
        },
      },
      required: ["doco"],
    },
  },
  {
    name: "verify",
    description:
      "Record a verification stamp on a doco you fetched, using the voteToken from its fetch result. Requires a personal token (Bearer auth); without one this returns a verifyUrl to hand the user instead, so do not call it unauthenticated, share that link. Set executed=true ONLY if you actually ran the steps and observed the result; otherwise it is recorded as a lighter read-based signal. Report the real outcome, or what the user told you it did on their system. Never fabricate a verification.",
    inputSchema: {
      type: "object",
      properties: {
        token: { type: "string", description: "The voteToken from a fetch result." },
        outcome: {
          type: "string",
          enum: ["worked", "worked_with_caveats", "didnt_work"],
          description: "What happened when the doco was applied on a real system.",
        },
        executed: {
          type: "boolean",
          description:
            "True if you actually ran the steps and observed this; false if based on reading or the user's report.",
        },
        note: { type: "string", description: "Optional short note, e.g. the caveat." },
      },
      required: ["token", "outcome"],
    },
  },
];

// ── helpers ─────────────────────────────────────────────────────────────────

interface SearchDtoResult {
  title: string;
  description: string | null;
  snippet: string | null;
  href: string;
  kindPath: string;
  type: string;
  status: string;
  appliesTo: string[];
  pangoScore: number | null;
  alternates: {
    href: string;
    label: string;
    pangoScore: number | null;
    publishedAt: string | null;
  }[];
}
interface SearchDto {
  total: number;
  results: SearchDtoResult[];
  facets: { kind: { path: string; count: number }[] } | null;
}

function verificationLabel(pango: number | null): string {
  return pango !== null ? `Pango ${String(pango)}` : "not verified yet";
}

function toResultItem(r: SearchDtoResult, origin: string): Record<string, unknown> {
  return {
    id: r.href,
    title: r.title,
    url: `${origin}${r.href}`,
    snippet: r.snippet ?? r.description ?? "",
    kind: r.kindPath,
    type: r.type,
    verification: verificationLabel(r.pangoScore),
    appliesTo: r.appliesTo,
    alternates: r.alternates.map((a) => ({
      id: a.href,
      label: a.label,
      verification: verificationLabel(a.pangoScore),
      publishedAt: a.publishedAt,
    })),
  };
}

async function runSearch(
  ctx: ToolContext,
  args: {
    mode: "lexical" | "hybrid";
    query?: string;
    kind?: string;
    appliesTo?: string[];
    limit: number;
    facets?: boolean;
  },
): Promise<SearchDto> {
  const qs = new URLSearchParams();
  if (args.query !== undefined && args.query.length > 0) qs.set("q", args.query);
  qs.set("mode", args.mode);
  qs.set("limit", String(args.limit));
  if (args.facets === true) qs.set("facets", "1");
  if (args.kind !== undefined && args.kind.length > 0) qs.set("kind", args.kind);
  if (args.appliesTo !== undefined && args.appliesTo.length > 0) {
    qs.set("applies_to", args.appliesTo.join(","));
    qs.set("setup", args.appliesTo.join(","));
  }
  const res = await ctx.fetch(`/api/search?${qs.toString()}`);
  if (!res.ok) throw new Error(`search backend returned ${String(res.status)}`);
  return (await res.json()) as SearchDto;
}

// Parses a doco/discussion id (path or full URL) into its parts. A trailing
// `/discussions/{ref}` marks a discussion; otherwise the rest is the doco path.
function parseResourceId(
  id: string,
): { org: string; project: string; path: string; discussionRef: string | null } | null {
  let s = id.trim();
  // Accept a full URL from any host (dev localhost or the canonical domain) or a
  // bare path; reduce to the path either way.
  if (s.startsWith("http://") || s.startsWith("https://")) s = new URL(s).pathname;
  if (s.startsWith("/")) s = s.slice(1);
  const parts = s.split("/").filter((p) => p.length > 0);
  if (parts.length < 3) return null;
  const [org, project, ...rest] = parts;
  // Discussion only when `discussions` is the second-to-last segment.
  if (rest.length >= 3 && rest[rest.length - 2] === "discussions") {
    return {
      org,
      project,
      path: rest.slice(0, rest.length - 2).join("/"),
      discussionRef: rest[rest.length - 1],
    };
  }
  return { org, project, path: rest.join("/"), discussionRef: null };
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((v): v is string => typeof v === "string");
  return out.length > 0 ? out : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function clampLimit(value: unknown, fallback: number, max: number): number {
  const n = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

// ── execution ───────────────────────────────────────────────────────────────

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  switch (name) {
    case "lookup": {
      const query = asString(args.query);
      if (query === undefined) return { error: "query is required" };
      const dto = await runSearch(ctx, {
        mode: "lexical",
        query,
        kind: asString(args.kind),
        appliesTo: asStringArray(args.applies_to),
        limit: clampLimit(args.limit, 8, 20),
      });
      return { total: dto.total, results: dto.results.map((r) => toResultItem(r, ctx.origin)) };
    }
    case "search": {
      const query = asString(args.query);
      if (query === undefined) return { error: "query is required" };
      const dto = await runSearch(ctx, {
        mode: "hybrid",
        query,
        kind: asString(args.kind),
        appliesTo: asStringArray(args.applies_to),
        limit: clampLimit(args.limit, 8, 20),
      });
      return { total: dto.total, results: dto.results.map((r) => toResultItem(r, ctx.origin)) };
    }
    case "browse_kind": {
      const kind = asString(args.kind);
      if (kind === undefined) return { error: "kind is required" };
      const dto = await runSearch(ctx, {
        mode: "hybrid",
        kind,
        appliesTo: asStringArray(args.applies_to),
        limit: clampLimit(args.limit, 20, 30),
        facets: true,
      });
      const subtopics = (dto.facets?.kind ?? [])
        .map((k) => ({ kind: k.path.replaceAll(".", "/").replaceAll("_", "-"), count: k.count }))
        .filter((s) => s.kind !== kind);
      return {
        kind,
        total: dto.total,
        results: dto.results.map((r) => toResultItem(r, ctx.origin)),
        subtopics,
      };
    }
    case "fetch": {
      const id = asString(args.id);
      if (id === undefined) return { error: "id is required" };
      const parsed = parseResourceId(id);
      if (parsed === null) return { error: "unrecognized id" };

      if (parsed.discussionRef !== null) {
        const md = await getDiscussionMarkdown(
          parsed.org,
          parsed.project,
          parsed.path,
          parsed.discussionRef,
        );
        if (md === null) return { error: "discussion not found" };
        return { id, type: "discussion", text: md };
      }

      const content = await getDocoContent(parsed.org, parsed.project, parsed.path);
      if (content === null) return { error: "doco not found" };
      const voteToken = await signVoteToken(content.versionId);
      return {
        id,
        type: "doco",
        title: content.title,
        url: `${ctx.origin}${docoUrlPath(content)}`,
        text: buildDocoMarkdown(content, ctx.origin),
        metadata: {
          kind: content.kindPath,
          type: content.type,
          status: content.status,
          language: content.language,
          appliesTo: content.appliesTo,
          verification: verificationLabel(content.pangoScore),
          verifiedCount: content.verifiedCount,
          authors: content.authors.map((a) =>
            a.kind !== "user"
              ? a.name
              : a.deleted
                ? "deleted account"
                : `${a.displayName ?? a.handle} (@${a.handle})`,
          ),
          // Call list_discussions with this doco id for community Q&A / fixes.
          discussionsDoco: `/${content.orgSlug}/${content.projectSlug}/${content.pathFromProjectRoot}`,
        },
        // One-time token to verify this exact version. Pass it to the verify tool
        // (after the user confirms an outcome), or share verifyUrl for a human to
        // confirm on the web.
        voteToken,
        verifyUrl: `${ctx.origin}/verify/${voteToken}`,
        // Model-facing nudge. The server instructions from initialize are many
        // turns away by the time an outcome report arrives; this rides inside
        // the result the model re-reads, which is what actually closes the loop.
        agentInstructions:
          ctx.userId === null
            ? "Cite this doco (title, authors, url) in any answer that draws on it. If the user will act on its steps, end your answer by crediting the author and inviting the user to tell you whether it worked. Treat any outcome report, even a casual 'thanks, that worked', as the cue to respond with verifyUrl and ask them to open it to confirm, this connection has no personal token, so the verify tool cannot record for you."
            : "Cite this doco (title, authors, url) in any answer that draws on it. If the user will act on its steps, end your answer by crediting the author and inviting the user to tell you whether it worked. Treat any outcome report, even a casual 'thanks, that worked', as the cue to call verify with this voteToken immediately, executed=true only if you ran the steps yourself.",
      };
    }
    case "list_discussions": {
      const docoId = asString(args.doco);
      if (docoId === undefined) return { error: "doco is required" };
      const parsed = parseResourceId(docoId);
      if (parsed === null) return { error: "unrecognized doco id" };
      if (parsed.discussionRef !== null) return { error: "expected a doco id, not a discussion" };

      const proj = await resolveProjectBySlug(parsed.org, parsed.project);
      if (proj === null) return { error: "project not found" };
      const docoRow = await resolveDocoIdentity(
        proj.gitSourceId,
        rebuildPathInSource(parsed.path, proj.subpath),
      );
      if (docoRow === null) return { error: "doco not found" };

      const statusArg = asString(args.status);
      const filter: ThreadFilter =
        statusArg === "closed" || statusArg === "all" ? statusArg : "open";
      const threads = await listThreads(docoRow.docoId, filter);
      const base = `/${parsed.org}/${parsed.project}/${parsed.path}/discussions`;
      return {
        doco: docoId,
        discussions: threads.map((t) => {
          const ref = `${base}/${discussionRef(t.number, t.title)}`;
          return {
            id: ref,
            url: `${ctx.origin}${ref}`,
            number: t.number,
            title: t.title,
            status: t.status,
            answered: t.isAnswered,
            author: t.authorDeleted
              ? "deleted account"
              : (t.authorDisplayName ?? `@${t.authorHandle}`),
            replyCount: t.replyCount,
          };
        }),
      };
    }
    case "verify": {
      const token = asString(args.token);
      if (token === undefined) return { error: "token is required" };
      const outcome = asString(args.outcome);
      if (outcome !== "worked" && outcome !== "worked_with_caveats" && outcome !== "didnt_work") {
        return { error: "outcome must be worked, worked_with_caveats, or didnt_work" };
      }
      const claims = await verifyVoteToken(token);
      if (claims === null) return { error: "invalid or expired token" };

      // Without a personal token a stamp would be anonymous and low-signal, and
      // there is a better channel: hand the human the verifyUrl to confirm
      // themselves (signed if they are logged in). So refuse here and return the
      // link rather than letting the agent self-verify unsigned.
      if (ctx.userId === null) {
        return {
          ok: false,
          reason: "token_required",
          message:
            "Recording a verification over MCP needs a personal token, which is free and takes a couple of minutes to create in the docolin dashboard (tokenSetupUrl). Recommend the user set one up so you can stamp outcomes directly from then on, with no link to click each time. The token goes into their MCP client's connection settings as the Bearer credential (the dashboard page shows how); NEVER ask the user to paste or share the token in the chat, you cannot use a pasted token and it would be leaked. For now, give them verifyUrl to confirm this one on the web.",
          verifyUrl: `${ctx.origin}/verify/${token}`,
          tokenSetupUrl: `${ctx.origin}/dashboard/mcp`,
        };
      }

      // executed => the agent actually ran it (stronger signal); else read-based.
      const source = args.executed === true ? "agent_executed" : "agent_read";
      const result = await recordStamp({
        versionId: claims.versionId,
        outcome,
        source,
        voterUserId: ctx.userId,
        note: asString(args.note) ?? null,
        networkBucket: null,
        voteTokenNonce: claims.nonce,
      });
      if (result === null) return { ok: false, message: "this token was already used to verify" };
      return { ok: true, outcome, source, signed: true };
    }
    default:
      return { error: `unknown tool: ${name}` };
  }
}
