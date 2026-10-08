// A recording is "silent" when Opus had almost nothing to encode: a quiet room
// still costs ~10+ kbps, a dead mic (e.g. a dropped Continuity iPhone mic)
// costs ~1-2 kbps. Seen in production: 52 s on the timer, 10.7 KB captured
// (1.6 kbps) while a normal 28 s take was 100 KB (28 kbps).
export const SILENT_KBPS = 5
const MIN_SECONDS_TO_JUDGE = 3

export function averageKbps(bytes: number, seconds: number): number {
  return seconds > 0 ? (bytes * 8) / seconds / 1000 : 0
}

export function looksSilent(bytes: number, seconds: number): boolean {
  if (seconds < MIN_SECONDS_TO_JUDGE) return false
  return averageKbps(bytes, seconds) < SILENT_KBPS
}
