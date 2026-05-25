import { m } from "$paraglide/messages";
import type { SearchSort } from "./types";

// Localized display labels for the fixed enum values that come back as raw
// strings (doco type, status, sort mode, language code). Centralized so the rail
// and the result cards render them identically.

export function typeLabel(value: string): string {
  switch (value) {
    case "tutorial":
      return m.search_type_tutorial();
    case "how-to":
      return m.search_type_how_to();
    case "reference":
      return m.search_type_reference();
    case "explanation":
      return m.search_type_explanation();
    default:
      return value;
  }
}

export function statusLabel(value: string): string {
  switch (value) {
    case "stable":
      return m.search_status_stable();
    case "needs-update":
      return m.search_status_needs_update();
    case "draft":
      return m.search_status_draft();
    default:
      return value;
  }
}

export function sortLabel(value: SearchSort): string {
  switch (value) {
    case "relevance":
      return m.search_sort_relevance();
    case "verified":
      return m.search_sort_verified();
    case "recent":
      return m.search_sort_recent();
    case "newest":
      return m.search_sort_newest();
  }
}

// Display name for a language code, e.g. `en` -> "English" in the reader's
// locale. Intl.DisplayNames returns undefined for an unknown code (it does not
// throw on a well-formed subtag), so we fall back to the uppercased code.
export function languageLabel(value: string, locale: string): string {
  const names = new Intl.DisplayNames([locale], { type: "language" });
  return names.of(value) ?? value.toUpperCase();
}
