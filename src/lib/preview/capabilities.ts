// Detects how (and whether) this browser can drive the local-folder preview, so
// the UI can offer the right entry point and show a clear message where it
// won't work.

export interface PreviewCapabilities {
  // The File System Access API (showDirectoryPicker): live reload, Chromium.
  fileSystemAccess: boolean;
  // <input webkitdirectory> folder upload: a one-shot snapshot, broader support.
  folderUpload: boolean;
  // A Chromium-based browser. With fileSystemAccess false, that means the API is
  // disabled (Brave does this by default) and can be turned on, vs Firefox /
  // Safari where it simply isn't supported.
  chromium: boolean;
  // Coarse "this is a phone/tablet" signal; the preview is desktop-only.
  mobile: boolean;
}

export function detectCapabilities(): PreviewCapabilities {
  if (typeof window === "undefined") {
    return { fileSystemAccess: false, folderUpload: false, chromium: false, mobile: false };
  }
  return {
    fileSystemAccess: "showDirectoryPicker" in window,
    // The attribute exists on the input prototype where directory upload works.
    folderUpload: "webkitdirectory" in document.createElement("input"),
    chromium: isChromium(),
    mobile: isMobile(),
  };
}

function isChromium(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } };
  const brands = nav.userAgentData?.brands;
  if (brands !== undefined) {
    return brands.some((b) => b.brand.toLowerCase().includes("chromium"));
  }
  const ua = navigator.userAgent;
  return ua.includes("Chrome") || ua.includes("Chromium");
}

// Brave exposes navigator.brave.isBrave(). Used to point the "enable the flag"
// help at the right brave://flags page.
export async function isBrave(): Promise<boolean> {
  const nav = navigator as Navigator & { brave?: { isBrave: () => Promise<boolean> } };
  if (nav.brave?.isBrave === undefined) return false;
  try {
    return await nav.brave.isBrave();
  } catch {
    // isBrave can reject in odd embeddings; treat as not-Brave.
    return false;
  }
}

function isMobile(): boolean {
  // Prefer the UA-Client-Hints mobile bit; fall back to a coarse pointer + narrow
  // viewport. This only needs to be good enough to show the desktop-only notice.
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  if (typeof nav.userAgentData?.mobile === "boolean") return nav.userAgentData.mobile;
  return window.matchMedia("(pointer: coarse)").matches && window.innerWidth < 1024;
}
