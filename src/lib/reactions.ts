// The reaction set for discussions, GitHub's eight. A fixed set (not free
// emoji input) keeps counts aggregatable, the UI scannable, and the DB check
// constraint enforceable. Shared by the picker UI, the toggle action, and the
// schema's check constraint, so the set can never drift between layers.
export const REACTION_EMOJIS = [
  "+1",
  "-1",
  "laugh",
  "hooray",
  "confused",
  "heart",
  "rocket",
  "eyes",
] as const;

export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

/** Rendered glyph per reaction key. Keys (not glyphs) are stored in the DB so
 *  a glyph swap never needs a migration. */
export const REACTION_GLYPHS: Record<ReactionEmoji, string> = {
  "+1": "\u{1F44D}",
  "-1": "\u{1F44E}",
  laugh: "\u{1F604}",
  hooray: "\u{1F389}",
  confused: "\u{1F615}",
  heart: "❤️",
  rocket: "\u{1F680}",
  eyes: "\u{1F440}",
};

export function isReactionEmoji(value: string): value is ReactionEmoji {
  return (REACTION_EMOJIS as readonly string[]).includes(value);
}
