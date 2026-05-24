// Masks an email for display: the first two local-part characters plus the
// domain's TLD, with fixed-length bullets so the address length isn't leaked.
// The owner still recognizes their own; a screen recording or shoulder-surfer
// can't read or guess it. Shared by MaskedEmail.svelte (the interactive,
// click-to-reveal component) and any static display where a reveal control
// can't be used (e.g. inside a link). String ops only, no regex.
export function maskEmail(value: string): string {
  const at = value.lastIndexOf("@");
  if (at <= 0) return "•••";
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  const tld = dot >= 0 ? domain.slice(dot) : "";
  return `${local.slice(0, 2)}•••@•••${tld}`;
}
