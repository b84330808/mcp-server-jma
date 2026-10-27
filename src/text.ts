// Small helpers for turning JMA's full-width text and timestamps into tidy values.

/** NFKC-normalises (full-width digits/spaces → ASCII) and collapses runs of spaces. */
export function tidy(text: string | null | undefined): string | null {
  if (text === null || text === undefined) return null;
  const out = text.normalize("NFKC").replace(/[ \t]+/g, " ").trim();
  return out === "" ? null : out;
}

/** Parses a numeric string; "" / "NaN" / non-numbers become null. */
export function num(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).normalize("NFKC"));
  return Number.isFinite(n) ? n : null;
}

/** "2026-10-27T11:00:00+09:00" → "2026-10-27" (the JST calendar date). */
export function jstDate(iso: string): string {
  return iso.slice(0, 10);
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** Formats a Date as an ISO 8601 string in JST, e.g. "2026-10-27T18:00:00+09:00". */
export function toJstIso(date: Date): string {
  const shifted = new Date(date.getTime() + JST_OFFSET_MS);
  return shifted.toISOString().replace(/\.\d{3}Z$/, "+09:00");
}

/**
 * Parses JMA's ISO 6709 coordinate string, e.g. "+37.4+141.5-60000/".
 * Depth is given in metres below sea level; it is returned in km.
 */
export function parseCoordinate(cod: string | null | undefined): {
  latitude: number | null;
  longitude: number | null;
  depth_km: number | null;
} {
  const m = /^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)?\/?$/.exec((cod ?? "").trim());
  if (!m) return { latitude: null, longitude: null, depth_km: null };
  const depthM = m[3] !== undefined ? Number(m[3]) : null;
  return {
    latitude: Number(m[1]),
    longitude: Number(m[2]),
    depth_km: depthM === null ? null : Math.abs(depthM) / 1000,
  };
}

/** Converts katakana to hiragana so either script matches JMA's hiragana readings. */
export function toHiragana(text: string): string {
  return text.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/**
 * Normalises romaji so "Tōkyō", "Toukyou", "TOKYO" and "Tokyo-to" compare equal
 * to JMA's "Tokyo". Long vowels collapse and "m" before b/p becomes "n".
 */
export function romajiKey(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z]/g, "")
    .replace(/ou/g, "o")
    .replace(/oo/g, "o")
    .replace(/uu/g, "u")
    .replace(/aa/g, "a")
    .replace(/ii/g, "i")
    .replace(/m(?=[bp])/g, "n");
}
