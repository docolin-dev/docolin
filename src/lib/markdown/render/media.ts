import { visit } from "unist-util-visit";
import { h } from "hastscript";
import type { Root } from "mdast";
import { iconHast } from "./icons.ts";

// Two render-only media enhancements, both driven by the image form `![alt](url)`
// so there is one syntax for embeds, and both degrading to a plain image elsewhere:
//
//   1. An image whose URL is a video file (`.mp4`, `.webm`, ...) renders as a native
//      <video controls>, which needs no client JS.
//   2. An image whose URL is a YouTube video becomes a privacy-first facade: the
//      thumbnail (lazy-loaded from YouTube's image CDN) with a play button. No
//      player, cookies, or tracking load until the reader clicks it; then the client
//      (src/lib/markdown/youtube.ts) swaps in a youtube-nocookie iframe. A YouTube
//      URL written as a link stays an ordinary link.
//
// Render-only: the underlying image round-trips through the sync pipeline unchanged,
// so nothing is added to the docomd syntax package.

const VIDEO_EXTENSIONS = [".mp4", ".webm", ".ogg", ".ogv", ".mov", ".m4v"];

function isVideoUrl(url: string): boolean {
  const path = url.split("?")[0].split("#")[0].toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => path.endsWith(ext));
}

// A valid YouTube video id is 11 chars of [A-Za-z0-9_-]. Validated because it is
// interpolated into the iframe src the client builds.
function isYoutubeId(id: string): boolean {
  if (id.length !== 11) return false;
  for (const ch of id) {
    const ok =
      (ch >= "a" && ch <= "z") ||
      (ch >= "A" && ch <= "Z") ||
      (ch >= "0" && ch <= "9") ||
      ch === "_" ||
      ch === "-";
    if (!ok) return false;
  }
  return true;
}

/** Extracts a YouTube video id from a watch / youtu.be / embed / shorts URL, or null
 *  if it is not a recognizable, valid YouTube URL. Uses the URL parser, no regex. */
export function youtubeId(raw: string): string | null {
  if (!URL.canParse(raw)) return null;
  const url = new URL(raw);
  const host = url.hostname.startsWith("www.") ? url.hostname.slice(4) : url.hostname;
  let id: string | null = null;
  if (host === "youtu.be") {
    id = url.pathname.slice(1).split("/")[0];
  } else if (
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "youtube-nocookie.com"
  ) {
    const parts = url.pathname.split("/").filter((part) => part.length > 0);
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else if (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "v")
      id = parts[1] ?? null;
  }
  return id !== null && isYoutubeId(id) ? id : null;
}

/** Adds video + YouTube-facade auto-detection to the render pipeline. Both use the
 *  image form `![alt](url)`: a video-file URL renders as <video>, a YouTube URL as
 *  the facade. A YouTube URL written as a link stays a link. */
export function remarkMedia() {
  return (tree: Root): undefined => {
    visit(tree, "image", (node) => {
      // Video file -> native <video controls> (no JS). The alt text becomes the
      // player's accessible name, mirroring what an <img> would announce.
      if (isVideoUrl(node.url)) {
        const data = node.data ?? (node.data = {});
        data.hName = "video";
        data.hProperties = {
          src: node.url,
          controls: true,
          preload: "metadata",
          className: ["doco-video"],
          ...(typeof node.alt === "string" && node.alt.length > 0
            ? { "aria-label": node.alt }
            : {}),
        };
        data.hChildren = [];
        return;
      }

      // YouTube URL -> click-to-load thumbnail facade. The alt text (if any) becomes
      // the screen-reader label; there is no visible caption.
      const id = youtubeId(node.url);
      if (id === null) return;
      const data = node.data ?? (node.data = {});
      data.hName = "button";
      data.hProperties = {
        type: "button",
        className: ["doco-youtube", "not-prose"],
        "data-yt-id": id,
        "aria-label":
          typeof node.alt === "string" && node.alt.length > 0
            ? `Play the YouTube video: ${node.alt}`
            : "Play the YouTube video",
      };
      data.hChildren = [
        h("span", { class: ["doco-youtube-media"] }, [
          h("img", {
            class: ["doco-youtube-thumb"],
            // Lazy so it only loads when scrolled near, and hqdefault always exists
            // (unlike maxresdefault). object-fit: cover crops its 4:3 to the 16:9 box.
            src: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
            alt: "",
            loading: "lazy",
          }),
          h("span", { class: ["doco-youtube-play"], "aria-hidden": "true" }, [
            iconHast("play", "size-8"),
          ]),
        ]),
      ];
    });
  };
}
