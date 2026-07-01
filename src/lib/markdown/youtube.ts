// Client-only: the YouTube facade (render/media.ts) makes NO request to YouTube
// until the reader clicks it. A single delegated listener turns a clicked facade
// into a youtube-nocookie iframe, so nothing third-party loads (no player, no
// cookies, no tracking) until the reader opts in. The video id was validated
// server-side, so it is safe to interpolate into the iframe src.

const IFRAME_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";

function loadEmbed(facade: HTMLElement): void {
  const id = facade.dataset.ytId;
  if (id === undefined) return;
  const iframe = document.createElement("iframe");
  iframe.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1`;
  iframe.title = "YouTube video player";
  iframe.allow = IFRAME_ALLOW;
  iframe.allowFullscreen = true;
  iframe.className = "doco-youtube-frame";
  facade.replaceWith(iframe);
}

/** Wires the click-to-load YouTube facade. One delegated listener covers every
 *  facade on the page (they are server-rendered), so no per-navigation re-render. */
export function setupYoutube(): () => void {
  function onClick(event: MouseEvent): void {
    if (!(event.target instanceof Element)) return;
    const facade = event.target.closest<HTMLElement>(".doco-youtube");
    if (facade === null) return;
    loadEmbed(facade);
  }
  document.addEventListener("click", onClick);
  return () => {
    document.removeEventListener("click", onClick);
  };
}
