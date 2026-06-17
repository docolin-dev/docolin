/**
 * Reserved handle registry. Determines what slugs are blocked from being
 * claimed by users or orgs at signup time. Used by both client (instant
 * feedback in the onboarding form) and server (final validation).
 *
 * Three categories:
 *
 *   - TAXONOMY_ROOTS:    top-level paths in the kind taxonomy. Permanent,
 *                        never claimable under any circumstance.
 *
 *   - SYSTEM_NAMES:      platform routes, sentinels, brand-operational names,
 *                        infrastructure paths. Permanent, never claimable.
 *
 *   - PRERESERVED_NAMES: names belonging to real-world entities (knowledge
 *                        platforms, research institutions, AI companies,
 *                        government bodies, standards organizations, major
 *                        brands). Default-blocked but the entity can claim
 *                        the handle through support-verified ownership proof.
 *
 * Plus prefix/suffix sets, custom numeric checks, and format validation.
 * Per CLAUDE.md 3.8, no regex. String operations only.
 *
 * Names are stored lowercase. The validation function normalizes input.
 */

// ─────────────────────────────────────────────────────────────────────────────
// TAXONOMY ROOTS
// Top-level paths in the kind taxonomy.
// ─────────────────────────────────────────────────────────────────────────────

// Top-level paths in the kind taxonomy. Reserved from day one so the taxonomy
// can grow into any of these without reclaiming handles. The browse landing
// renders this list directly, alphabetically; membership checks elsewhere go
// through TAXONOMY_ROOTS (the Set) below.
export const TAXONOMY_ROOTS_LIST = [
  "agriculture",
  "art",
  "blog",
  "business",
  "career",
  "cloud",
  "crafts",
  "culture",
  "data",
  "devops",
  "economics",
  "education",
  "entertainment",
  "example",
  "finance",
  "fitness",
  "food",
  "gaming",
  "geography",
  "hardware",
  "health",
  "history",
  "home",
  "language",
  "law",
  "math",
  "network",
  "news",
  "os",
  "outdoors",
  "parenting",
  "pets",
  "philosophy",
  "programming",
  "psychology",
  "religion",
  "science",
  "security",
  "society",
  "software",
  "sports",
  "tools",
  "travel",
  "vehicles",
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM NAMES
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_NAMES_LIST = [
  // Auth, onboarding, and identity
  "2fa",
  "api-key",
  "api-keys",
  "auth",
  "authorization",
  "authorize",
  "callback",
  "client",
  "clients",
  "confirm",
  "consent",
  "credential",
  "credentials",
  "forgot-password",
  "key",
  "keys",
  "login",
  "logout",
  "magic-link",
  "mfa",
  "oauth",
  "oauth-callback",
  "oidc",
  "onboarding",
  "openid",
  "passkey",
  "passkeys",
  "password-reset",
  "recovery",
  "register",
  "reset-password",
  "saml",
  "scope",
  "scopes",
  "session",
  "sessions",
  "signin",
  "signout",
  "signup",
  "sso",
  "token",
  "tokens",
  "verify",
  "webauthn",

  // RFC 2142 mailbox names (operational standards for role-based email)
  "hostmaster",
  "info",
  "marketing",
  "noc",
  "postmaster",
  "sales",
  "webmaster",

  // Subdomain conventions (mail, infra)
  "dns",
  "extranet",
  "ftp",
  "imap",
  "intranet",
  "mail",
  "mta",
  "mx",
  "ns",
  "ns1",
  "ns2",
  "ns3",
  "ns4",
  "pop",
  "pop3",
  "relay",
  "secure",
  "sftp",
  "smtp",
  "ssh",
  "vpn",
  "webmail",

  // Well-known file roots (humans.txt, ads.txt, etc.)
  "ads",
  "app-ads",
  "browserconfig",
  "clientaccesspolicy",
  "crossdomain",
  "humans",
  "manifest",
  "security-txt",

  // Platform pages
  "about",
  "account",
  "accounts",
  "admin",
  "app",
  "browse",
  "changelog",
  "contact",
  "dashboard",
  "discover",
  "edit",
  "editor",
  "events",
  "explore",
  "faq",
  "faqs",
  "feed",
  "gallery",
  "help",
  "home",
  "inbox",
  "index",
  "main",
  "me",
  "mine",
  "mobile",
  "my",
  "new",
  "notifications",
  "notify",
  "overview",
  "personal",
  "profile",
  "profiles",
  "search",
  "self",
  "settings",
  "showcase",
  "site",
  "status",
  "support",
  "timeline",
  "tour",
  "trending",
  "web",
  "you",

  // Wiki-style namespaces (knowledge platform conventions)
  "article",
  "articles",
  "backlinks",
  "category",
  "changes",
  "entries",
  "entry",
  "file",
  "files",
  "log",
  "logs",
  "move",
  "page",
  "pages",
  "playground",
  "portal",
  "portals",
  "preview",
  "random",
  "recent",
  "recent-changes",
  "recentchanges",
  "rename",
  "rollback",
  "sandbox",
  "section",
  "sections",
  "special",
  "talk",
  "template",
  "templates",
  "undelete",
  "what-links-here",
  "whatlinkshere",

  // Citation and source primitives (load-bearing terminology)
  "bib",
  "bibliography",
  "citation",
  "citations",
  "claim",
  "claims",
  "corrigendum",
  "endnote",
  "endnotes",
  "errata",
  "erratum",
  "evidence",
  "excerpt",
  "fact-check",
  "factcheck",
  "footnote",
  "footnotes",
  "paper",
  "papers",
  "peer-review",
  "peerreview",
  "primary-source",
  "publication",
  "publications",
  "quote",
  "quotes",
  "reference",
  "references",
  "retracted",
  "retraction",
  "source",
  "sources",
  "verified-source",

  // Content, discovery, social
  "addon",
  "addons",
  "bookmark",
  "bookmarks",
  "categories",
  "collection",
  "collections",
  "directory",
  "doc",
  "docs",
  "documentation",
  "editors-choice",
  "example",
  "examples",
  "extension",
  "extensions",
  "favorites",
  "featured",
  "features",
  "follow",
  "followers",
  "following",
  "follows",
  "guide",
  "guides",
  "latest",
  "library",
  "like",
  "milestone",
  "milestones",
  "newsletter",
  "plugin",
  "plugins",
  "popular",
  "post",
  "posts",
  "project",
  "projects",
  "recommend",
  "recommendations",
  "release",
  "releases",
  "roadmap",
  "share",
  "showcases",
  "staff-picks",
  "starred",
  "stars",
  "subscribe",
  "tags",
  "ticket",
  "tickets",
  "top",
  "topics",
  "tutorial",
  "tutorials",
  "updates",
  "widget",
  "widgets",

  // Multimedia
  "audio",
  "live",
  "podcast",
  "podcasts",
  "stream",
  "streams",
  "video",
  "videos",

  // API and integration surfaces
  "admin-api",
  "api",
  "assets",
  "avatar",
  "avatars",
  "cdn",
  "download",
  "downloads",
  "embed",
  "favicon",
  "graphql",
  "iframe",
  "image",
  "images",
  "integration",
  "integrations",
  "internal",
  "mcp",
  "media",
  "oembed",
  "private",
  "public",
  "raw",
  "rest",
  "robots",
  "rss",
  "sitemap",
  "static",
  "upload",
  "uploads",
  "webhook",
  "webhooks",
  "well-known",

  // Policy, legal, moderation
  "abuse",
  "accessibility",
  "appeal",
  "appeals",
  "attribution",
  "ban",
  "banned",
  "blocked",
  "blocks",
  "ccpa",
  "code-of-conduct",
  "community-guidelines",
  "compliance",
  "cookie-policy",
  "disclaimer",
  "dmca",
  "enforcement",
  "flagged",
  "gdpr",
  "imprint",
  "impressum",
  "legal",
  "licenses",
  "moderation",
  "moderator",
  "moderators",
  "mods",
  "muted",
  "mutes",
  "pending",
  "policies",
  "policy",
  "privacy",
  "report",
  "reports",
  "restricted",
  "safety",
  "spam",
  "suspended",
  "terms",
  "tns",
  "tos",
  "trust-and-safety",
  "verification",
  "verified",

  // Brand and operational (docolin). `docolin` itself lives in PRERESERVED
  // so we can claim and seed it as the platform's own org.
  "docolin-bot",
  "docolin-help",
  "docolin-official",
  "docolin-staff",
  "docolin-support",
  "docolin-team",
  "docolin1",
  "docolinhq",
  "official",
  "official-docolin",
  "staff",
  "support-team",
  "team",
  "team-docolin",

  // Brand typo defenses (Levenshtein-1 of "docolin")
  "d0c0lin",
  "d0colin",
  "decolin",
  "doc0lin",
  "docalin",
  "doclin",
  "docolim",
  "docollin",
  "docolen",
  "docolinai",
  "docolinapp",
  "docolinhelp",
  "docolin-ai",
  "docolyn",
  "docol1n",
  "docoolin",
  "docoiin", // capital-I-as-l visual confusion
  "docolinn",
  "dockolin",
  "dokolin",
  "officialdocolin",

  // Operational and infrastructure (generic)
  "administrator",
  "bot",
  "bots",
  "dev",
  "developer",
  "developers",
  "devops-team",
  "eng",
  "engineering",
  "hooks",
  "hosting",
  "identity",
  "infra",
  "infrastructure",
  "join",
  "launch",
  "mailer",
  "maintenance",
  "malware",
  "no-reply",
  "noreply",
  "operator",
  "ops",
  "render",
  "root",
  "service",
  "services",
  "site-policy",
  "sudo",
  "system",

  // Generic high-value names. Common impersonation targets; reserved so
  // nobody can claim them and misrepresent the platform.
  "ai",
  "ai-assistant",
  "assistant",
  "business",
  "businesses",
  "careers",
  "chat",
  "chatbot",
  "community",
  "donate",
  "enterprise",
  "forum",
  "jobs",
  "marketplace",
  "media-kit",
  "partners",
  "plans",
  "plus",
  "premium",
  "press",
  "pricing",
  "pro",
  "shop",
  "sponsor",
  "sponsors",
  "store",
  "teams",

  // Agent / prompt-injection mitigation (handles that AI agents might
  // misread as platform-context instructions when surfaced in their output)
  "agent",
  "agents",
  "function-call",
  "instructions",
  "mcp-server",
  "model",
  "models",
  "prompt",
  "prompts",
  "system-prompt",
  "tool-use",

  // Payment and finance terms. Common in phishing flows; reserved so nobody
  // can fake a checkout or billing page under a docolin URL.
  "bank",
  "billing",
  "cart",
  "checkout",
  "crypto",
  "invoice",
  "invoices",
  "order",
  "orders",
  "pay",
  "payment",
  "payments",
  "refund",
  "refunds",
  "transactions",
  "wallet",
  "wire",

  // Version control / doco-flow routing
  "backup",
  "backups",
  "branches",
  "clone",
  "commit",
  "commits",
  "compare",
  "diff",
  "draft",
  "drafts",
  "fork",
  "forks",
  "history",
  "issue",
  "issues",
  "merge",
  "mirror",
  "mirrors",
  "pr",
  "pull",
  "pulls",
  "recycle",
  "recycle-bin",
  "restore",
  "revert",
  "revisions",
  "rollback",
  "sync",
  "syncs",
  "trash",
  "tree",
  "version",
  "versions",

  // Common content/utility routes
  "cache",
  "export",
  "go",
  "import",
  "link",
  "links",
  "out",
  "pdf",
  "print",
  "proxy",
  "r",
  "redirect",

  // Common roles (impersonation of leadership/staff)
  "ceo",
  "cfo",
  "chief",
  "co-founder",
  "cofounder",
  "contributor",
  "contributors",
  "coo",
  "cto",
  "director",
  "employee",
  "employees",
  "founder",
  "maintainer",
  "maintainers",
  "manager",
  "member",
  "members",
  "owner",
  "president",

  // User self-reference and generic identifiers
  "anon",
  "anonymous",
  "everybody",
  "everyone",
  "guest",
  "guests",
  "nobody",
  "org",
  "orgs",
  "organization",
  "organizations",
  "private-user",
  "public-user",
  "somebody",
  "someone",
  "user",
  "users",
  "username",

  // System sentinels and tombstones (must not collide with code sentinels)
  "default",
  "deleted",
  "demo",
  "empty",
  "example",
  "false",
  "ghost",
  "nan",
  "nil",
  "none",
  "null",
  "placeholder",
  "removed",
  "sample",
  "test",
  "testing",
  "todo",
  "true",
  "undefined",
  "unknown",
  "void",
  // Programmer placeholder names (foo, bar, baz, qux)
  "bar",
  "baz",
  "foo",
  "qux",

  // Emergency and crisis terms (misinformation under these is catastrophic)
  "112",
  "911",
  "crisis",
  "emergency",
  "hotline",
  "poison-control",
  "suicide",

  // i18n routing (3-letter ISO 3166-1 alpha-3 country codes for common
  // destinations; 2-letter codes are already blocked by MIN_HANDLE_LENGTH)
  "aus",
  "aut",
  "bel",
  "bra",
  "can",
  "che",
  "chn",
  "deu",
  "esp",
  "fra",
  "gbr",
  "ind",
  "ita",
  "jpn",
  "kor",
  "mex",
  "nld",
  "nzl",
  "pol",
  "prt",
  "rus",
  "swe",
  "tur",
  "usa",

  // Locale codes likely to appear in i18n routing
  "de-de",
  "en-au",
  "en-ca",
  "en-gb",
  "en-in",
  "en-us",
  "es-es",
  "es-mx",
  "fr-ca",
  "pt-br",
  "zh-cn",
  "zh-hk",
  "zh-tw",

  // www variants (subdomain-style prefixes)
  "www",
  "www0",
  "www1",
  "www2",
  "www3",
  "www4",
  "www5",
  "www6",
  "www7",
  "www8",
  "www9",

  // Windows reserved filenames (defense if handles ever become directory names)
  "aux",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "con",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9",
  "nul",
  "prn",
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// PRE-RESERVED NAMES
// ─────────────────────────────────────────────────────────────────────────────

const PRERESERVED_NAMES_LIST = [
  // docolin itself. PRERESERVED rather than permanently-blocked so we can
  // seed it as the platform's own org at initialization.
  "docolin",

  // Knowledge platforms (impersonation dilutes citation trust)
  "britannica",
  "encyclopedia",
  "mdn",
  "medium",
  "quora",
  "reddit",
  "stackexchange",
  "stackoverflow",
  "substack",
  "wiki",
  "wikipedia",
  "wikis",

  // Scholarly archives and identifiers
  "archive",
  "archiveorg",
  "arxiv",
  "crossref",
  "doi",
  "internet-archive",
  "orcid",
  "osf",
  "pubmed",
  "wayback",
  "zenodo",

  // Research institutions
  "berkeley",
  "caltech",
  "cambridge",
  "cmu",
  "columbia",
  "cornell",
  "eth",
  "ethz",
  "harvard",
  "imperial",
  "mit",
  "ox",
  "oxford",
  "princeton",
  "stanford",
  "ucla",
  "ucl",
  "yale",

  // Government and intergovernmental bodies
  "africa-cdc",
  "cdc",
  "cia",
  "dhs",
  "dod",
  "ecdc",
  "efsa",
  "ema",
  "epa",
  "europol",
  "fbi",
  "fda",
  "g20",
  "g7",
  "gchq",
  "gov",
  "hhs",
  "icc",
  "icj",
  "icrc",
  "imf",
  "interpol",
  "irs",
  "mi5",
  "mi6",
  "mossad",
  "nasa",
  "nato",
  "nhs",
  "nih",
  "nist",
  "nsa",
  "oecd",
  "paho",
  "un",
  "unesco",
  "unhcr",
  "unicef",
  "usps",
  "wbo",
  "who",
  "world-bank",
  "worldbank",
  "wto",

  // Standards bodies
  "acm",
  "ansi",
  "bsi",
  "cve",
  "din",
  "iana",
  "ieee",
  "iec",
  "ietf",
  "iso",
  "itu",
  "jis",
  "mitre",
  "owasp",
  "w3c",

  // AI companies and platforms
  "anthropic",
  "claude",
  "copilot",
  "deepmind",
  "gemini",
  "google",
  "gpt",
  "hf",
  "huggingface",
  "meta",
  "microsoft",
  "mistral",
  "openai",
  "perplexity",
  "xai",

  // AI products and models
  "bard",
  "chatgpt",
  "dall-e",
  "dalle",
  "elevenlabs",
  "grok",
  "haiku",
  "llama",
  "midjourney",
  "opus",
  "runway",
  "sonnet",
  "sora",
  "stable-diffusion",
  "stablediffusion",
  "suno",
  "udio",

  // Major tech companies
  "amazon",
  "amd",
  "apple",
  "broadcom",
  "cisco",
  "cloudflare",
  "dell",
  "ebay",
  "hp",
  "ibm",
  "intel",
  "lenovo",
  "lg",
  "netflix",
  "nvidia",
  "oracle",
  "qualcomm",
  "salesforce",
  "samsung",
  "shopify",
  "siemens",
  "sony",
  "spotify",
  "stripe",
  "tesla",
  "uber",
  "x",
  "youtube",

  // Cloud and hosting platforms
  "aws",
  "azure",
  "digitalocean",
  "do",
  "firebase",
  "fly",
  "gcp",
  "heroku",
  "linode",
  "netlify",
  "neon",
  "planetscale",
  "railway",
  "render",
  "supabase",
  "vercel",
  "workos",

  // Operating systems and major OSS projects
  "android",
  "arch",
  "bsd",
  "centos",
  "debian",
  "django",
  "docker",
  "fedora",
  "freebsd",
  "gnu",
  "ios",
  "kubernetes",
  "linux",
  "mac",
  "macos",
  "manjaro",
  "mint",
  "nextjs",
  "node",
  "nodejs",
  "openbsd",
  "popos",
  "rails",
  "react",
  "redhat",
  "rhel",
  "rocky",
  "ruby",
  "rust",
  "suse",
  "svelte",
  "sveltekit",
  "ubuntu",
  "vue",
  "windows",
  "zorin",

  // Package registries and dev tooling
  "apt",
  "brew",
  "cargo",
  "composer",
  "conda",
  "crates",
  "go",
  "golang",
  "homebrew",
  "maven",
  "npm",
  "nuget",
  "pacman",
  "pypi",
  "rubygems",
  "yum",

  // Code hosting and developer communities
  "bitbucket",
  "codeberg",
  "gitea",
  "github",
  "gitlab",
  "sourcehut",

  // Browsers
  "brave",
  "chrome",
  "edge",
  "firefox",
  "mozilla",
  "opera",
  "safari",

  // Social and communication platforms
  "bluesky",
  "bsky",
  "discord",
  "facebook",
  "fb",
  "ig",
  "instagram",
  "li",
  "linkedin",
  "mastodon",
  "pinterest",
  "signal",
  "slack",
  "snapchat",
  "soundcloud",
  "telegram",
  "threads",
  "tiktok",
  "tumblr",
  "twitch",
  "twitter",
  "vimeo",
  "whatsapp",

  // Gaming platforms and major game studios
  "blizzard",
  "ea",
  "epic",
  "nintendo",
  "playstation",
  "riot",
  "sega",
  "steam",
  "ubisoft",
  "valve",
  "xbox",

  // Automotive brands (cars are a kind root; impersonation under brand names matters)
  "audi",
  "bmw",
  "ferrari",
  "ford",
  "honda",
  "hyundai",
  "kia",
  "mercedes",
  "mercedes-benz",
  "porsche",
  "toyota",
  "vw",

  // E-commerce and retail
  "alibaba",
  "etsy",
  "walmart",

  // Media and entertainment
  "disney",
  "hbo",
  "paramount",
  "warner",

  // News and journalism (impersonation on a knowledge platform is high-impact)
  "afp",
  "ap",
  "associated-press",
  "axios",
  "bbc",
  "bloomberg",
  "cnn",
  "economist",
  "ft",
  "guardian",
  "npr",
  "nyt",
  "nytimes",
  "politico",
  "reuters",
  "wapo",
  "washingtonpost",
  "wsj",

  // Medical references (impersonation could spread harmful advice)
  "clinic",
  "diagnosis",
  "doctor",
  "dr",
  "hospital",
  "mayo",
  "medical",
  "medicine",
  "nurse",
  "pharmacy",
  "prescription",
  "treatment",
  "webmd",
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// PREFIX AND SUFFIX SETS
// Suffix or prefix matches indicate authority-claiming or role impersonation
// (e.g. `nvidia-official`, `the-real-anthropic`).
// ─────────────────────────────────────────────────────────────────────────────

const RESERVED_SUFFIXES_LIST = [
  "-admin",
  "-ai",
  "-api",
  "-bot",
  "-corp",
  "-dev",
  "-help",
  "-hq",
  "-inc",
  "-llc",
  "-mod",
  "-official",
  "-prod",
  "-staff",
  "-staging",
  "-support",
  "-team",
  "-test",
] as const;

const RESERVED_PREFIXES_LIST = [
  "admin-",
  "bot-",
  "docolin-",
  "mod-",
  "official-",
  "real-",
  "staff-",
  "support-",
  "system-",
  "team-",
  "the-",
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// RESERVED PROJECT SLUGS
// Second URL segment under `/{org}/{project}/...`. Excludes the small set of
// project-level admin routes so a project slug never collides with them.
// Handle-level reserved lists DON'T apply here, only this list does.
// ─────────────────────────────────────────────────────────────────────────────

const RESERVED_PROJECT_SLUGS_LIST = [
  // Admin routes mounted at /dashboard/{org}/{project}/{x} and any future
  // public-side per-project routes
  "settings",
  "members",
  "source",
  "sources",
  "new",
  "edit",
  "delete",
  "transfer",
  "clone",
  "fork",
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// FORMAT RULES
// ─────────────────────────────────────────────────────────────────────────────

export const MIN_HANDLE_LENGTH = 3;
export const MAX_HANDLE_LENGTH = 30;

/**
 * Validates handle character set and structure without regex.
 * Allowed: lowercase letters, digits, single dashes.
 * Disallowed: leading/trailing dash, consecutive dashes, anything non-ASCII.
 *
 * ASCII-only is a deliberate homoglyph defense (Cyrillic 'с' looks identical
 * to Latin 'c'; without this rule, `сlaude` becomes claimable).
 */
export function isValidHandleFormat(handle: string): boolean {
  if (handle.length === 0) return false;
  if (handle.startsWith("-") || handle.endsWith("-")) return false;
  let prevWasDash = false;
  for (const c of handle) {
    const isLower = c >= "a" && c <= "z";
    const isDigit = c >= "0" && c <= "9";
    const isDash = c === "-";
    if (!isLower && !isDigit && !isDash) return false;
    if (isDash && prevWasDash) return false;
    prevWasDash = isDash;
  }
  return true;
}

/** All-digit handles like `404`, `12345`. Catches HTTP status codes, numeric squats. */
export function isPureNumeric(handle: string): boolean {
  if (handle.length === 0) return false;
  for (const c of handle) {
    if (c < "0" || c > "9") return false;
  }
  return true;
}

/** Handles like `v0`, `v1`, `v42` (API version prefix collisions). */
export function isVNumeric(handle: string): boolean {
  if (handle.length < 2) return false;
  if (!handle.startsWith("v")) return false;
  for (const c of handle.slice(1)) {
    if (c < "0" || c > "9") return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// LOOKUP SETS (O(1) membership checks)
// ─────────────────────────────────────────────────────────────────────────────

export const TAXONOMY_ROOTS: ReadonlySet<string> = new Set(TAXONOMY_ROOTS_LIST);
export const SYSTEM_NAMES: ReadonlySet<string> = new Set(SYSTEM_NAMES_LIST);
export const PRERESERVED_NAMES: ReadonlySet<string> = new Set(PRERESERVED_NAMES_LIST);
export const RESERVED_SUFFIXES: ReadonlySet<string> = new Set(RESERVED_SUFFIXES_LIST);
export const RESERVED_PREFIXES: ReadonlySet<string> = new Set(RESERVED_PREFIXES_LIST);
export const RESERVED_PROJECT_SLUGS: ReadonlySet<string> = new Set(RESERVED_PROJECT_SLUGS_LIST);

// ─────────────────────────────────────────────────────────────────────────────
// AVAILABILITY CHECK
// ─────────────────────────────────────────────────────────────────────────────

export type HandleAvailability =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "too_short"
        | "too_long"
        | "invalid_format"
        | "pure_numeric"
        | "v_numeric"
        | "reserved_taxonomy"
        | "reserved_system"
        | "reserved_prereserved"
        | "matches_prefix"
        | "matches_suffix";
      detail?: string;
    };

/**
 * Validates handle shape and reservation status. Does NOT check database
 * uniqueness or profanity. Those checks happen server-side after this passes.
 *
 * `reserved_prereserved` results return ok: false; the support-claim path runs
 * separately when an entity proves ownership of that name.
 */
export function checkHandleAvailability(input: string): HandleAvailability {
  const handle = input.trim().toLowerCase();

  if (handle.length < MIN_HANDLE_LENGTH) {
    return { ok: false, reason: "too_short" };
  }
  if (handle.length > MAX_HANDLE_LENGTH) {
    return { ok: false, reason: "too_long" };
  }
  if (!isValidHandleFormat(handle)) {
    return { ok: false, reason: "invalid_format" };
  }
  if (isPureNumeric(handle)) {
    return { ok: false, reason: "pure_numeric" };
  }
  if (isVNumeric(handle)) {
    return { ok: false, reason: "v_numeric" };
  }
  if (TAXONOMY_ROOTS.has(handle)) {
    return { ok: false, reason: "reserved_taxonomy" };
  }
  if (SYSTEM_NAMES.has(handle)) {
    return { ok: false, reason: "reserved_system" };
  }
  if (PRERESERVED_NAMES.has(handle)) {
    return { ok: false, reason: "reserved_prereserved" };
  }
  for (const prefix of RESERVED_PREFIXES) {
    if (handle.startsWith(prefix)) {
      return { ok: false, reason: "matches_prefix", detail: prefix };
    }
  }
  for (const suffix of RESERVED_SUFFIXES) {
    if (handle.endsWith(suffix)) {
      return { ok: false, reason: "matches_suffix", detail: suffix };
    }
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT SLUG AVAILABILITY
// Mirrors the handle validator but with a smaller reserved set and a shorter
// min length. Project slugs can be 2 chars (e.g. `ui`, `db`).
// ─────────────────────────────────────────────────────────────────────────────

export const MIN_PROJECT_SLUG_LENGTH = 2;
export const MAX_PROJECT_SLUG_LENGTH = 30;

export type ProjectSlugAvailability =
  | { ok: true }
  | {
      ok: false;
      reason: "too_short" | "too_long" | "invalid_format" | "reserved";
    };

export function checkProjectSlugAvailability(input: string): ProjectSlugAvailability {
  const slug = input.trim().toLowerCase();
  if (slug.length < MIN_PROJECT_SLUG_LENGTH) {
    return { ok: false, reason: "too_short" };
  }
  if (slug.length > MAX_PROJECT_SLUG_LENGTH) {
    return { ok: false, reason: "too_long" };
  }
  if (!isValidHandleFormat(slug)) {
    return { ok: false, reason: "invalid_format" };
  }
  if (RESERVED_PROJECT_SLUGS.has(slug)) {
    return { ok: false, reason: "reserved" };
  }
  return { ok: true };
}
