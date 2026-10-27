import { fetchJson, TTL } from "./http.js";
import { num, parseCoordinate, tidy } from "./text.js";
import type { RawQuakeEarthquake, RawQuakeListEntry, RawTsunamiDetail } from "./types.js";

export const TSUNAMI_LIST_PATH = "tsunami/data/list.json";
const BULLETIN_FILE = /^[0-9A-Za-z_]+\.json$/;

// Category codes (津波警報・注意報・予報の種類) as used in the bulletins.
const MAJOR_WARNING = new Set(["52", "53"]); // 大津波警報
const WARNING = new Set(["51"]); // 津波警報
const ADVISORY = new Set(["62"]); // 津波注意報
const FORECAST = new Set(["71", "72", "73"]); // 津波予報

export type TsunamiLevel = "major_warning" | "warning" | "advisory" | "forecast" | "none";

export function tsunamiLevel(code: string | undefined): TsunamiLevel {
  if (!code) return "none";
  if (MAJOR_WARNING.has(code)) return "major_warning";
  if (WARNING.has(code)) return "warning";
  if (ADVISORY.has(code)) return "advisory";
  if (FORECAST.has(code)) return "forecast";
  return "none";
}

const LEVEL_RANK: Record<TsunamiLevel, number> = { none: 0, forecast: 1, advisory: 2, warning: 3, major_warning: 4 };

export interface TsunamiBulletin {
  event_id: string;
  title: string;
  report_datetime: string;
  /** Forecast-only bulletins expire at this time; warnings stay until lifted. */
  valid_until: string | null;
  in_effect: boolean;
  highest_level: TsunamiLevel;
  headline: string | null;
  earthquake: {
    origin_time: string | null;
    epicenter: string | null;
    epicenter_en: string | null;
    latitude: number | null;
    longitude: number | null;
    depth_km: number | null;
    magnitude: number | null;
  } | null;
  comment: { ja: string | null; en: string | null } | null;
  categories: Array<{
    category: string;
    category_en: string | null;
    level: TsunamiLevel;
    areas: Array<{
      code: string;
      name: string;
      name_en: string | null;
      /** Expected maximum height, e.g. "<0.2" (metres) or "巨大" (huge). */
      max_height: string | null;
      /** First-wave arrival time, or a condition such as 第１波の到達を確認. */
      first_wave: string | null;
    }>;
  }>;
  observations: Array<{ station: string; max_height: string | null; observed_at: string | null; first_wave: string | null }>;
}

function firstQuake(eq: RawQuakeEarthquake | RawQuakeEarthquake[] | undefined): RawQuakeEarthquake | undefined {
  return Array.isArray(eq) ? eq[0] : eq;
}

export function parseTsunamiDetail(detail: RawTsunamiDetail, now: Date): TsunamiBulletin {
  const validUntil = detail.Head.ValidDateTime ?? null;
  const expired = validUntil !== null && new Date(validUntil).getTime() <= now.getTime();

  const groups = new Map<string, TsunamiBulletin["categories"][number]>();
  let highest: TsunamiLevel = "none";
  for (const item of detail.Body?.Tsunami?.Forecast?.Item ?? []) {
    const kind = item.Category?.Kind;
    const name = kind?.Name ?? "不明";
    const level = tsunamiLevel(kind?.Code);
    if (LEVEL_RANK[level] > LEVEL_RANK[highest]) highest = level;
    const group = groups.get(name) ?? { category: name, category_en: kind?.enName ?? null, level, areas: [] };
    group.areas.push({
      code: item.Area.Code,
      name: item.Area.Name,
      name_en: item.Area.enName ?? null,
      max_height: tidy(item.MaxHeight?.TsunamiHeight ?? item.MaxHeight?.Condition),
      first_wave: tidy(item.FirstHeight?.ArrivalTime ?? item.FirstHeight?.Condition),
    });
    groups.set(name, group);
  }

  const observations: TsunamiBulletin["observations"] = [];
  for (const item of detail.Body?.Tsunami?.Observation?.Item ?? []) {
    for (const s of item.Station ?? []) {
      observations.push({
        station: s.Name,
        max_height: tidy(s.MaxHeight?.TsunamiHeight ?? s.MaxHeight?.Condition),
        observed_at: s.MaxHeight?.DateTime ?? null,
        first_wave: tidy(s.FirstHeight?.ArrivalTime ?? s.FirstHeight?.Condition ?? s.FirstHeight?.Initial),
      });
    }
  }

  const eq = firstQuake(detail.Body?.Earthquake);
  const area = eq?.Hypocenter?.Area;
  const warningComment = detail.Body?.Comments?.WarningComment;

  return {
    event_id: detail.Head.EventID,
    title: detail.Head.Title,
    report_datetime: detail.Head.ReportDateTime,
    valid_until: validUntil,
    in_effect: highest !== "none" && !expired,
    highest_level: highest,
    headline: tidy(detail.Head.Headline?.Text),
    earthquake: eq
      ? {
          origin_time: eq.OriginTime ?? null,
          epicenter: tidy(area?.Name),
          epicenter_en: tidy(area?.enName),
          ...(() => {
            const c = parseCoordinate(area?.Coordinate);
            return { latitude: c.latitude, longitude: c.longitude, depth_km: c.depth_km };
          })(),
          magnitude: num(eq.Magnitude),
        }
      : null,
    comment: warningComment ? { ja: tidy(warningComment.Text), en: tidy(warningComment.enText) } : null,
    categories: [...groups.values()].sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level]),
    observations,
  };
}

export async function getTsunamiInfo(options: { limit?: number; now?: Date } = {}): Promise<{
  any_warning_in_effect: boolean;
  any_in_effect: boolean;
  bulletins: TsunamiBulletin[];
  source_url: string;
}> {
  const { limit = 3, now = new Date() } = options;
  const entries = await fetchJson<RawQuakeListEntry[]>(TSUNAMI_LIST_PATH, TTL.list);

  // Newest bulletin per event; it supersedes earlier ones for the same event.
  const latest = new Map<string, RawQuakeListEntry>();
  for (const e of Array.isArray(entries) ? entries : []) {
    const prev = latest.get(e.eid);
    if (!prev || e.ctt > prev.ctt) latest.set(e.eid, e);
  }
  const recent = [...latest.values()]
    .filter((e) => BULLETIN_FILE.test(e.json))
    .sort((a, b) => b.ctt.localeCompare(a.ctt))
    .slice(0, limit);

  const bulletins = await Promise.all(
    recent.map(async (e) => parseTsunamiDetail(await fetchJson<RawTsunamiDetail>(`tsunami/data/${e.json}`, TTL.bulletin), now))
  );

  return {
    any_warning_in_effect: bulletins.some((b) => b.in_effect && LEVEL_RANK[b.highest_level] >= LEVEL_RANK.advisory),
    any_in_effect: bulletins.some((b) => b.in_effect),
    bulletins,
    source_url: "https://www.jma.go.jp/bosai/map.html#contents=tsunami",
  };
}
