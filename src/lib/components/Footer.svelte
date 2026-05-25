<script lang="ts">
  import { m } from "$paraglide/messages";
  import { localizeHref } from "$paraglide/runtime";
  import {
    SITE_NAME,
    SITE_REPO,
    SITE_AUTHOR,
    SITE_AUTHOR_URL,
    SITE_LICENSE,
    SITE_LICENSE_URL,
  } from "$lib/site";

  const year = new Date().getFullYear();
</script>

<footer class="border-foreground/10 border-t">
  <div class="mx-auto max-w-6xl px-6 py-12 sm:py-16">
    <div class="grid grid-cols-1 gap-10 sm:grid-cols-[1fr_auto] sm:items-end">
      <div>
        <p class="text-base font-semibold tracking-tight">{SITE_NAME}</p>
        <p class="text-muted-foreground mt-2 max-w-md text-sm">
          {m.home_footer_tagline()}
        </p>
        <p class="text-muted-foreground/80 mt-4 text-xs">
          &copy; {year}
          &middot;
          <a
            href={SITE_LICENSE_URL}
            target="_blank"
            rel="noopener noreferrer"
            class="hover:text-foreground underline-offset-4 hover:underline">{SITE_LICENSE}</a
          >
          &middot;
          {m.home_footer_built_by()}
          <a
            href={SITE_AUTHOR_URL}
            target="_blank"
            rel="noopener noreferrer"
            class="hover:text-foreground underline-offset-4 hover:underline">{SITE_AUTHOR}</a
          >
        </p>
      </div>

      <nav
        aria-label="Footer"
        class="text-muted-foreground grid grid-cols-2 gap-x-10 gap-y-2 text-sm sm:grid-cols-3"
      >
        <a href={localizeHref("/about")} class="hover:text-foreground transition-colors"
          >{m.home_footer_about()}</a
        >
        <a href={localizeHref("/browse")} class="hover:text-foreground transition-colors"
          >{m.home_footer_browse()}</a
        >
        <a href={localizeHref("/compare")} class="hover:text-foreground transition-colors"
          >{m.home_footer_compare()}</a
        >
        <a href={localizeHref("/for-projects")} class="hover:text-foreground transition-colors"
          >{m.home_footer_projects()}</a
        >
        <a href={localizeHref("/mcp")} class="hover:text-foreground transition-colors"
          >{m.home_footer_ai()}</a
        >
        <a
          href={SITE_REPO}
          target="_blank"
          rel="noopener noreferrer"
          class="hover:text-foreground transition-colors">{m.home_footer_github()}</a
        >
        <a href={localizeHref("/sponsor")} class="hover:text-foreground transition-colors"
          >{m.home_footer_sponsor()}</a
        >
        <a
          href={localizeHref("/docolin/docolin/privacy")}
          class="hover:text-foreground transition-colors">{m.home_footer_privacy()}</a
        >
        <a href={localizeHref("/terms")} class="hover:text-foreground transition-colors"
          >{m.home_footer_terms()}</a
        >
      </nav>
    </div>
  </div>
</footer>
