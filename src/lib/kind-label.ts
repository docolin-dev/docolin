import { m } from "$paraglide/messages";
import { labelForSegment } from "$lib/components/search/kind-tree";

// Localized display labels for the taxonomy's top-level roots, a small fixed set
// (see reserved-handles). The browse page shows these by name in the reader's
// language; English also fixes acronym casing (os -> OS, devops -> DevOps).
// Deeper, open-ended taxonomy segments fall back to titleizing: the full, growing
// taxonomy can only be localized from the kinds registry, not a code map. A Map
// (not a plain object) so an unknown segment reads back as undefined.
const ROOT_LABELS = new Map<string, () => string>([
  ["blog", m.kind_root_blog],
  ["cloud", m.kind_root_cloud],
  ["data", m.kind_root_data],
  ["devops", m.kind_root_devops],
  ["hardware", m.kind_root_hardware],
  ["network", m.kind_root_network],
  ["os", m.kind_root_os],
  ["programming", m.kind_root_programming],
  ["security", m.kind_root_security],
  ["software", m.kind_root_software],
  ["tools", m.kind_root_tools],
  ["agriculture", m.kind_root_agriculture],
  ["art", m.kind_root_art],
  ["business", m.kind_root_business],
  ["career", m.kind_root_career],
  ["crafts", m.kind_root_crafts],
  ["culture", m.kind_root_culture],
  ["economics", m.kind_root_economics],
  ["education", m.kind_root_education],
  ["entertainment", m.kind_root_entertainment],
  ["finance", m.kind_root_finance],
  ["fitness", m.kind_root_fitness],
  ["food", m.kind_root_food],
  ["gaming", m.kind_root_gaming],
  ["geography", m.kind_root_geography],
  ["health", m.kind_root_health],
  ["history", m.kind_root_history],
  ["home", m.kind_root_home],
  ["language", m.kind_root_language],
  ["law", m.kind_root_law],
  ["math", m.kind_root_math],
  ["news", m.kind_root_news],
  ["outdoors", m.kind_root_outdoors],
  ["parenting", m.kind_root_parenting],
  ["pets", m.kind_root_pets],
  ["philosophy", m.kind_root_philosophy],
  ["psychology", m.kind_root_psychology],
  ["religion", m.kind_root_religion],
  ["science", m.kind_root_science],
  ["society", m.kind_root_society],
  ["sports", m.kind_root_sports],
  ["travel", m.kind_root_travel],
  ["vehicles", m.kind_root_vehicles],
]);

// Display label for a kind segment: the localized root label when the segment is
// a top-level root, otherwise the titleized segment.
export function kindLabel(segment: string): string {
  return ROOT_LABELS.get(segment)?.() ?? labelForSegment(segment);
}
