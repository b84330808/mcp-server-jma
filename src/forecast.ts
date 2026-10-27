import { fetchJson, TTL } from "./http.js";
import { resolveForOffice } from "./areas.js";
import { WEATHER_CODES } from "./weatherCodes.js";
import { jstDate, num, tidy, toJstIso } from "./text.js";
import type {
  AreaMatch,
  RawForecastAreaMap,
  RawForecastReport,
  RawOverview,
  RawTimeSeries,
  RawWeekAreaMap,
} from "./types.js";

export interface DailyWeather {
  date: string;
  weather: string | null;
  weather_code: string | null;
  weather_en: string | null;
  wind: string | null;
  wave: string | null;
}

export interface PrecipChance {
  from: string;
  to: string;
  percent: number | null;
}

export interface ForecastResult {
  office: { code: string; name: string };
  resolved: { query: string; code: string; level: string; name: string; name_en: string; path: string };
  other_candidates: Array<{ code: string; name: string; name_en: string; path: string }>;
  publishing_office: string | null;
  report_datetime: string | null;
  overview: { report_datetime: string; headline: string | null; text: string | null } | null;
  short_term: {
    areas: Array<{ code: string; name: string; days: DailyWeather[]; precipitation_chance: PrecipChance[] }>;
    temperatures: Array<{
      station_code: string;
      station: string;
      days: Array<{ date: string; min_c: number | null; max_c: number | null }>;
    }>;
  };
  weekly: {
    report_datetime: string | null;
    areas: Array<{
      code: string;
      name: string;
      days: Array<{
        date: string;
        weather_code: string | null;
        weather: string | null;
        weather_en: string | null;
        precipitation_chance_percent: number | null;
        reliability: string | null;
      }>;
    }>;
    temperatures: Array<{
      station_code: string;
      station: string;
      days: Array<{
        date: string;
        min_c: number | null;
        min_c_range: [number, number] | null;
        max_c: number | null;
        max_c_range: [number, number] | null;
      }>;
    }>;
    normals: Array<{
      station_code: string;
      station: string;
      temp_min_c: number | null;
      temp_max_c: number | null;
      precip_7day_total_mm: { min: number | null; max: number | null } | null;
    }>;
  } | null;
  source_url: string;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function weatherLabel(code: string | null): { ja: string | null; en: string | null } {
  const entry = code ? WEATHER_CODES[code] : undefined;
  return entry ? { ja: entry[0], en: entry[1] } : { ja: null, en: null };
}

function findSeries(report: RawForecastReport | undefined, key: string): RawTimeSeries | undefined {
  return report?.timeSeries.find((ts) => ts.areas.some((a) => key in a));
}

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

/**
 * Short-term temperatures pair a 00:00 slot (morning low) with a 09:00 slot
 * (daytime high) per day. After the morning, JMA keeps today's 00:00 slot but
 * repeats the high in it, listed after the 09:00 slot; that value is not a low.
 */
function pairTemps(times: string[], values: unknown[]): Array<{ date: string; min_c: number | null; max_c: number | null }> {
  const days = new Map<string, { date: string; min_c: number | null; max_c: number | null; maxIdx: number }>();
  times.forEach((t, i) => {
    const date = jstDate(t);
    const day = days.get(date) ?? { date, min_c: null, max_c: null, maxIdx: -1 };
    const value = num(str(values[i]));
    if (t.slice(11, 13) === "09") {
      day.max_c = value;
      day.maxIdx = i;
    } else if (day.maxIdx === -1) {
      day.min_c = value;
    }
    days.set(date, day);
  });
  return [...days.values()].map(({ date, min_c, max_c }) => ({ date, min_c, max_c }));
}

function range(lower: unknown, upper: unknown): [number, number] | null {
  const lo = num(str(lower));
  const hi = num(str(upper));
  return lo === null || hi === null ? null : [lo, hi];
}

export function parseForecast(
  reports: RawForecastReport[],
  focusClass10: string | null,
  forecastArea: RawForecastAreaMap[string] | undefined,
  weekArea: RawWeekAreaMap[string] | undefined
): Pick<ForecastResult, "publishing_office" | "report_datetime" | "short_term" | "weekly"> {
  const [short, week] = reports;

  // ── short term (today + 2 days) ──
  const weatherTs = findSeries(short, "weatherCodes");
  const popTs = findSeries(short, "pops");
  const tempTs = findSeries(short, "temps");

  const areaCodes = (weatherTs?.areas ?? []).map((a) => a.area.code);
  const wantedClass10 = focusClass10 && areaCodes.includes(focusClass10) ? focusClass10 : null;

  const areas = (weatherTs?.areas ?? [])
    .filter((a) => !wantedClass10 || a.area.code === wantedClass10)
    .map((a) => {
      const codes = arr(a["weatherCodes"]);
      const days: DailyWeather[] = (weatherTs?.timeDefines ?? []).map((t, i) => {
        const code = str(codes[i]);
        return {
          date: jstDate(t),
          weather: tidy(str(arr(a["weathers"])[i])),
          weather_code: code,
          weather_en: weatherLabel(code).en,
          wind: tidy(str(arr(a["winds"])[i])),
          wave: tidy(str(arr(a["waves"])[i])),
        };
      });
      const popArea = popTs?.areas.find((p) => p.area.code === a.area.code);
      const popTimes = popTs?.timeDefines ?? [];
      const precipitation_chance: PrecipChance[] = popArea
        ? popTimes.map((t, i) => ({
            from: t,
            to: popTimes[i + 1] ?? toJstIso(new Date(new Date(t).getTime() + SIX_HOURS_MS)),
            percent: num(str(arr(popArea["pops"])[i])),
          }))
        : [];
      return { code: a.area.code, name: a.area.name, days, precipitation_chance };
    });

  const wantedStations = new Set(
    (forecastArea ?? []).filter((f) => f.class10 === wantedClass10).flatMap((f) => f.amedas)
  );
  const tempAreas = (tempTs?.areas ?? []).filter((a) => !wantedClass10 || wantedStations.size === 0 || wantedStations.has(a.area.code));
  const temperatures = tempAreas.map((a) => ({
    station_code: a.area.code,
    station: a.area.name,
    days: pairTemps(tempTs?.timeDefines ?? [], arr(a["temps"])),
  }));

  // ── weekly (7 days) ──
  let weekly: ForecastResult["weekly"] = null;
  if (week) {
    const wWeatherTs = findSeries(week, "weatherCodes");
    const wTempTs = findSeries(week, "tempsMin");
    const wantedWeek = new Set((weekArea ?? []).filter((w) => w.srf === wantedClass10).map((w) => w.week));
    const wantedWeekStations = new Set((weekArea ?? []).filter((w) => w.srf === wantedClass10).map((w) => w.amedas));
    const keepArea = (code: string) => !wantedClass10 || wantedWeek.size === 0 || wantedWeek.has(code);
    const keepStation = (code: string) =>
      !wantedClass10 || wantedWeekStations.size === 0 || wantedWeekStations.has(code) || wantedStations.has(code);

    weekly = {
      report_datetime: week.reportDatetime ?? null,
      areas: (wWeatherTs?.areas ?? [])
        .filter((a) => keepArea(a.area.code))
        .map((a) => ({
          code: a.area.code,
          name: a.area.name,
          days: (wWeatherTs?.timeDefines ?? []).map((t, i) => {
            const code = str(arr(a["weatherCodes"])[i]);
            const label = weatherLabel(code);
            return {
              date: jstDate(t),
              weather_code: code,
              weather: label.ja,
              weather_en: label.en,
              precipitation_chance_percent: num(str(arr(a["pops"])[i])),
              reliability: str(arr(a["reliabilities"])[i]),
            };
          }),
        })),
      temperatures: (wTempTs?.areas ?? [])
        .filter((a) => keepStation(a.area.code))
        .map((a) => ({
          station_code: a.area.code,
          station: a.area.name,
          days: (wTempTs?.timeDefines ?? []).map((t, i) => ({
            date: jstDate(t),
            min_c: num(str(arr(a["tempsMin"])[i])),
            min_c_range: range(arr(a["tempsMinLower"])[i], arr(a["tempsMinUpper"])[i]),
            max_c: num(str(arr(a["tempsMax"])[i])),
            max_c_range: range(arr(a["tempsMaxLower"])[i], arr(a["tempsMaxUpper"])[i]),
          })),
        })),
      normals: (week.tempAverage?.areas ?? [])
        .filter((a) => keepStation(a.area.code))
        .map((a) => {
          const precip = week.precipAverage?.areas.find((p) => p.area.code === a.area.code);
          return {
            station_code: a.area.code,
            station: a.area.name,
            temp_min_c: num(a.min),
            temp_max_c: num(a.max),
            precip_7day_total_mm: precip ? { min: num(precip.min), max: num(precip.max) } : null,
          };
        }),
    };
  }

  return {
    publishing_office: short?.publishingOffice ?? null,
    report_datetime: short?.reportDatetime ?? null,
    short_term: { areas, temperatures },
    weekly,
  };
}

function focusClass10Of(match: AreaMatch, resolveClass10: (code: string) => string | null): string | null {
  if (match.level === "class10" || match.level === "class15" || match.level === "class20") {
    return resolveClass10(match.code);
  }
  return null;
}

export function summarizeCandidate(m: AreaMatch): { code: string; name: string; name_en: string; path: string } {
  return { code: m.code, name: m.name, name_en: m.name_en, path: m.path };
}

/** 3-day + 7-day forecast for a place name or JMA area code. */
export async function getForecast(query: string): Promise<ForecastResult> {
  const resolved = await resolveForOffice(query);
  const { index, match, office_code } = resolved;

  const [reports, overview, forecastArea, weekArea] = await Promise.all([
    fetchJson<RawForecastReport[]>(`forecast/data/forecast/${office_code}.json`, TTL.forecast),
    fetchJson<RawOverview>(`forecast/data/overview_forecast/${office_code}.json`, TTL.forecast).catch(() => null),
    fetchJson<RawForecastAreaMap>("forecast/const/forecast_area.json", TTL.constant).catch(() => ({}) as RawForecastAreaMap),
    fetchJson<RawWeekAreaMap>("forecast/const/week_area.json", TTL.constant).catch(() => ({}) as RawWeekAreaMap),
  ]);

  const focus = focusClass10Of(match, (code) => index.class10Of(code)?.code ?? null);
  const parsed = parseForecast(reports, focus, forecastArea[office_code], weekArea[office_code]);

  return {
    office: { code: office_code, name: resolved.office_name },
    resolved: { query, code: match.code, level: match.level, name: match.name, name_en: match.name_en, path: match.path },
    other_candidates: resolved.other_candidates.map(summarizeCandidate),
    ...parsed,
    overview: overview
      ? { report_datetime: overview.reportDatetime, headline: tidy(overview.headlineText), text: tidy(overview.text) }
      : null,
    source_url: `https://www.jma.go.jp/bosai/forecast/#area_type=offices&area_code=${office_code}`,
  };
}
