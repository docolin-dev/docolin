// Parse author-written time estimates ("15m", "1h", "1h30m", "30m-1h") into
// a normalized minutes range. The version row stores min and max minutes as
// separate integers; this module is the only place that knows the wire format.
//
// No regex per CLAUDE.md 3.8: char-by-char scan is short and explicit about
// what's accepted.

export interface TimeEstimateRange {
  minMinutes: number;
  maxMinutes: number;
}

// Parses a single duration like "15m", "2h", "1h30m" into total minutes.
// Returns null if the input doesn't match the accepted grammar.
function parseDurationToMinutes(input: string): number | null {
  let hours = 0;
  let minutes = 0;
  let buf = "";
  let sawHours = false;
  let sawMinutes = false;

  for (const c of input) {
    if (c >= "0" && c <= "9") {
      buf += c;
    } else if (c === "h") {
      if (buf === "" || sawHours) return null;
      hours = Number(buf);
      buf = "";
      sawHours = true;
    } else if (c === "m") {
      if (buf === "" || sawMinutes) return null;
      minutes = Number(buf);
      buf = "";
      sawMinutes = true;
    } else {
      return null;
    }
  }

  if (buf !== "") return null;
  if (!sawHours && !sawMinutes) return null;
  return hours * 60 + minutes;
}

export function parseTimeEstimate(raw: string): TimeEstimateRange | null {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length === 0) return null;

  const dashIdx = trimmed.indexOf("-");
  if (dashIdx === -1) {
    const m = parseDurationToMinutes(trimmed);
    return m === null ? null : { minMinutes: m, maxMinutes: m };
  }

  const minPart = trimmed.slice(0, dashIdx).trim();
  const maxPart = trimmed.slice(dashIdx + 1).trim();
  const min = parseDurationToMinutes(minPart);
  const max = parseDurationToMinutes(maxPart);
  if (min === null || max === null) return null;
  if (max < min) return null;
  return { minMinutes: min, maxMinutes: max };
}
