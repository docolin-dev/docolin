import adapter from "@sveltejs/adapter-cloudflare";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  compilerOptions: {
    // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
    runes: ({ filename }) => (filename.split(/[/\\]/).includes("node_modules") ? undefined : true),
  },
  kit: {
    // Cloudflare Pages adapter. In `vite dev` the adapter wires up
    // wrangler.toml bindings (R2, KV, Cron, env vars) via getPlatformProxy
    // so `event.platform.env.MEDIA_BUCKET` works in dev exactly like in prod.
    adapter: adapter(),
    alias: {
      $paraglide: "src/paraglide",
    },
  },
};

export default config;
