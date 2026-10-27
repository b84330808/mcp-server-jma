import { fetchJson, JmaError, TTL } from "./http.js";
import { intensity, intensityRank, PREFECTURE_BY_CODE, type IntensityValue } from "./codes.js";
import { num, parseCoordinate, tidy } from "./text.js";
import type { RawComment, RawQuakeDetail, RawQuakeEarthquake, RawQuakeListEntry } from "./types.js";

export const QUAKE_LIST_PATH = "quake/data/list.json";

export interface Epicenter {
  name: string | null;
  name_en: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Depth below sea level in km; 0 means "very shallow" (ごく浅い). */
  depth_km: number | null;
}

export interface EarthquakeSummary {
  event_id: string;
  origin_time: string | null;
  latest_report: { title: string; title_en: string | null; report_datetime: string; info_type: string };
  epicenter: Epicenter;
  /** JMA magnitude (Mj); null when not yet determined. */
  magnitude: number | null;
  max_intensity: IntensityValue | null;
  prefectures: Array<{ code: string; name: string; name_en: string | null; max_intensity: IntensityValue | null }>;
  /** Pass to jma_get_earthquake as `detail_id` for per-area intensities. */
  detail_id: string;
}

/**
 * The list has one row per bulletin; an event (eid) usually has several
 * (震度速報 → 震源に関する情報 → 震源・震度情報). The newest bulletin wins,
 * with fields it lacks filled in from older ones.
 */
export function summarizeEvents(entries: RawQuakeListEntry[]): EarthquakeSummary[] {
  const byEvent = new Map<string, RawQuakeListEntry[]>();
  for (const e of entries) {
    const list = byEvent.get(e.eid) ?? [];
    list.push(e);
    byEvent.set(e.eid, list);
  }

  const events: EarthquakeSummary[] = [];
  for (const [eid, bulletins] of byEvent) {
    bulletins.sort((a, b) => b.ctt.localeCompare(a.ctt));
    const latest = bulletins[0];
    const pick = <K extends keyof RawQuakeListEntry>(key: K): RawQuakeListEntry[K] | undefined =>
      bulletins.map((b) => b[key]).find((v) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0));

    const withIntensity = bulletins.find((b) => (b.int?.length ?? 0) > 0);
    const coord = parseCoordinate(pick("cod") as string | undefined);
    const detailSource =
      bulletins.find((b) => b.ttl === "震源・震度情報") ?? bulletins.find((b) => (b.int?.length ?? 0) > 0) ?? latest;

    events.push({
      event_id: eid,
      origin_time: (pick("at") as string | undefined) ?? null,
      latest_report: { title: latest.ttl, title_en: latest.en_ttl ?? null, report_datetime: latest.rdt, info_type: latest.ift },
      epicenter: {
        name: tidy(pick("anm") as string | undefined),
        name_en: tidy(pick("en_anm") as string | undefined),
        ...coord,
      },
      magnitude: num(pick("mag") as string | undefined),
      max_intensity: intensity(pick("maxi") as string | undefined),
      prefectures: (withIntensity?.int ?? []).map((p) => {
        const pref = PREFECTURE_BY_CODE.get(p.code);
        return { code: p.code, name: pref?.ja ?? p.code, name_en: pref?.en ?? null, max_intensity: intensity(p.maxi) };
      }),
      detail_id: detailSource.json,
    });
  }

  return events.sort((a, b) => (b.origin_time ?? "").localeCompare(a.origin_time ?? ""));
}

export interface ListEarthquakesOptions {
  limit?: number;
  min_intensity?: string;
  min_magnitude?: number;
  since_hours?: number;
  now?: Date;
}

export async function listEarthquakes(options: ListEarthquakesOptions = {}): Promise<{
  earthquakes: EarthquakeSummary[];
  matched: number;
  list_covers_from: string | null;
  source_url: string;
}> {
  const { limit = 10, min_intensity, min_magnitude, since_hours, now = new Date() } = options;
  const entries = await fetchJson<RawQuakeListEntry[]>(QUAKE_LIST_PATH, TTL.list);
  const all = summarizeEvents(Array.isArray(entries) ? entries : []);

  const minRank = min_intensity ? intensityRank(min_intensity) : 0;
  const since = since_hours !== undefined ? now.getTime() - since_hours * 3_600_000 : null;
  const filtered = all.filter((e) => {
    if (minRank > 0 && intensityRank(e.max_intensity?.value) < minRank) return false;
    if (min_magnitude !== undefined && (e.magnitude === null || e.magnitude < min_magnitude)) return false;
    if (since !== null && (e.origin_time === null || new Date(e.origin_time).getTime() < since)) return false;
    return true;
  });

  return {
    earthquakes: filtered.slice(0, limit),
    matched: filtered.length,
    list_covers_from: all.length ? all[all.length - 1].origin_time : null,
    source_url: "https://www.jma.go.jp/bosai/map.html#contents=earthquake_map",
  };
}

// ─── detail ──────────────────────────────────────────────────────────────────

export interface EarthquakeDetail {
  event_id: string;
  title: string;
  report_datetime: string;
  headline: string | null;
  origin_time: string | null;
  epicenter: Epicenter | null;
  magnitude: number | null;
  max_intensity: IntensityValue | null;
  tsunami_comment: { ja: string | null; en: string | null } | null;
  other_comments: Array<{ ja: string | null; en: string | null }>;
  intensity_by_prefecture: Array<{
    code: string;
    name: string;
    name_en: string | null;
    max_intensity: IntensityValue | null;
    areas: Array<{
      code: string;
      name: string;
      name_en: string | null;
      max_intensity: IntensityValue | null;
      cities: Array<{
        code: string;
        name: string;
        max_intensity: IntensityValue | null;
        stations?: Array<{ name: string; name_en: string | null; intensity: IntensityValue | null; latitude: number | null; longitude: number | null }>;
      }>;
    }>;
  }>;
  detail_id: string;
  source_url: string;
}

function firstQuake(eq: RawQuakeEarthquake | RawQuakeEarthquake[] | undefined): RawQuakeEarthquake | undefined {
  return Array.isArray(eq) ? eq[0] : eq;
}

function comment(c: RawComment | undefined): { ja: string | null; en: string | null } | null {
  if (!c || (!c.Text && !c.enText)) return null;
  return { ja: tidy(c.Text), en: tidy(c.enText) };
}

export function parseEarthquakeDetail(detail: RawQuakeDetail, detailId: string, includeStations: boolean): EarthquakeDetail {
  const eq = firstQuake(detail.Body?.Earthquake);
  const area = eq?.Hypocenter?.Area;
  const obs = detail.Body?.Intensity?.Observation;
  const comments = detail.Body?.Comments;

  return {
    event_id: detail.Head.EventID,
    title: detail.Head.Title,
    report_datetime: detail.Head.ReportDateTime,
    headline: tidy(detail.Head.Headline?.Text),
    origin_time: eq?.OriginTime ?? null,
    epicenter: area
      ? { name: tidy(area.Name), name_en: tidy(area.enName), ...parseCoordinate(area.Coordinate) }
      : null,
    magnitude: num(eq?.Magnitude),
    max_intensity: intensity(obs?.MaxInt),
    tsunami_comment: comment(comments?.ForecastComment),
    other_comments: [comment(comments?.VarComment)].filter((c): c is { ja: string | null; en: string | null } => c !== null),
    intensity_by_prefecture: (obs?.Pref ?? []).map((p) => ({
      code: p.Code,
      name: p.Name,
      name_en: p.enName ?? null,
      max_intensity: intensity(p.MaxInt),
      areas: (p.Area ?? []).map((a) => ({
        code: a.Code,
        name: a.Name,
        name_en: a.enName ?? null,
        max_intensity: intensity(a.MaxInt),
        cities: (a.City ?? [])
          .map((c) => ({
            code: c.Code,
            name: c.Name,
            max_intensity: intensity(c.MaxInt),
            ...(includeStations
              ? {
                  stations: (c.IntensityStation ?? []).map((s) => ({
                    name: s.Name,
                    name_en: s.enName ?? null,
                    intensity: intensity(s.Int),
                    latitude: s.latlon?.lat ?? null,
                    longitude: s.latlon?.lon ?? null,
                  })),
                }
              : {}),
          }))
          .sort((x, y) => intensityRank(y.max_intensity?.value) - intensityRank(x.max_intensity?.value)),
      })),
    })),
    detail_id: detailId,
    source_url: "https://www.jma.go.jp/bosai/map.html#contents=earthquake_map",
  };
}

const DETAIL_ID = /^[0-9A-Za-z_]+\.json$/;

export async function getEarthquakeDetail(options: {
  event_id?: string;
  detail_id?: string;
  include_stations?: boolean;
}): Promise<EarthquakeDetail> {
  let detailId = options.detail_id?.trim();

  if (!detailId) {
    const eventId = options.event_id?.trim();
    if (!eventId) {
      throw new JmaError({ code: "INVALID_INPUT", message: "Give either 'event_id' or 'detail_id'." }, "Missing id");
    }
    const entries = await fetchJson<RawQuakeListEntry[]>(QUAKE_LIST_PATH, TTL.list);
    const summary = summarizeEvents((Array.isArray(entries) ? entries : []).filter((e) => e.eid === eventId))[0];
    if (!summary) {
      throw new JmaError(
        {
          code: "EVENT_NOT_FOUND",
          message: `Earthquake event ${eventId} is not in JMA's recent list. The list only covers recent weeks; use jma_list_earthquakes to see valid event_id values.`,
        },
        "Event not found"
      );
    }
    detailId = summary.detail_id;
  }

  if (!DETAIL_ID.test(detailId)) {
    throw new JmaError(
      { code: "INVALID_INPUT", message: "'detail_id' must look like '20261008041755_20261008041355_VXSE5k_1.json'." },
      "Bad detail id"
    );
  }

  const detail = await fetchJson<RawQuakeDetail>(`quake/data/${detailId}`, TTL.bulletin);
  return parseEarthquakeDetail(detail, detailId, options.include_stations ?? false);
}
