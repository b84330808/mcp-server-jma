export interface McpErrorPayload {
  code: string;
  message: string;
  details?: string;
  candidates?: unknown[];
}

// ─── area.json ───────────────────────────────────────────────────────────────

export interface RawAreaEntry {
  name: string;
  enName: string;
  kana?: string;
  officeName?: string;
  parent?: string;
  children?: string[];
}

export interface RawAreaJson {
  centers: Record<string, RawAreaEntry>;
  offices: Record<string, RawAreaEntry>;
  class10s: Record<string, RawAreaEntry>;
  class15s: Record<string, RawAreaEntry>;
  class20s: Record<string, RawAreaEntry>;
}

export type AreaLevel = "center" | "office" | "class10" | "class15" | "class20";

export interface AreaMatch {
  code: string;
  level: AreaLevel;
  name: string;
  name_en: string;
  kana: string | null;
  /** Human-readable hierarchy, e.g. "関東甲信地方 > 東京都 > 東京地方 > 23区西部 > 渋谷区". */
  path: string;
  /** Forecast office code (府県予報区) used by forecasts and warnings; null for regional centers. */
  office_code: string | null;
  office_name: string | null;
  score: number;
}

// ─── forecast ────────────────────────────────────────────────────────────────

export interface RawTimeSeriesArea {
  area: { name: string; code: string };
  [key: string]: unknown;
}

export interface RawTimeSeries {
  timeDefines: string[];
  areas: RawTimeSeriesArea[];
}

export interface RawForecastReport {
  publishingOffice: string;
  reportDatetime: string;
  timeSeries: RawTimeSeries[];
  tempAverage?: { areas: Array<{ area: { name: string; code: string }; min: string; max: string }> };
  precipAverage?: { areas: Array<{ area: { name: string; code: string }; min: string; max: string }> };
}

export interface RawOverview {
  publishingOffice: string;
  reportDatetime: string;
  targetArea: string;
  headlineText: string;
  text: string;
}

export type RawForecastAreaMap = Record<string, Array<{ class10: string; amedas: string[]; class20: string }>>;
export type RawWeekAreaMap = Record<string, Array<{ srf: string; week: string; amedas: string }>>;

// ─── warnings (r8 format, since 2026-05-28) ─────────────────────────────────

export interface RawWarningKind {
  code?: string;
  status: string;
  additions?: string[];
}

export interface RawWarningItem {
  areaCode: string;
  kinds: RawWarningKind[];
}

export interface RawWarningReport {
  controlDatetime?: string;
  reportDatetime: string;
  infoType?: string;
  publishingOffice?: string;
  headlineText?: string;
  dataTypeCode?: string;
  warning?: {
    class10Items?: RawWarningItem[];
    class20Items?: RawWarningItem[];
  };
}

// ─── earthquakes ─────────────────────────────────────────────────────────────

export interface RawQuakeListEntry {
  ctt: string;
  eid: string;
  rdt: string;
  ttl: string;
  ift: string;
  ser: string | number;
  at: string;
  anm: string;
  acd: string;
  cod: string;
  mag: string;
  maxi: string;
  int?: Array<{ code: string; maxi: string; city?: Array<{ code: string; maxi: string }> }>;
  json: string;
  en_ttl?: string;
  en_anm?: string;
}

export interface RawHypocenter {
  Area?: { Name?: string; Code?: string; Coordinate?: string; enName?: string; DetailedName?: string };
  Source?: string;
}

export interface RawQuakeEarthquake {
  OriginTime?: string;
  ArrivalTime?: string;
  Hypocenter?: RawHypocenter;
  Magnitude?: string;
}

export interface RawIntensityStation {
  Name: string;
  Code: string;
  Int: string;
  enName?: string;
  latlon?: { lat: number; lon: number };
}

export interface RawIntensityCity {
  Name: string;
  Code: string;
  MaxInt?: string;
  enName?: string;
  IntensityStation?: RawIntensityStation[];
}

export interface RawIntensityArea {
  Name: string;
  Code: string;
  MaxInt?: string;
  enName?: string;
  City?: RawIntensityCity[];
}

export interface RawIntensityPref {
  Name: string;
  Code: string;
  MaxInt?: string;
  enName?: string;
  Area?: RawIntensityArea[];
}

export interface RawComment {
  Text?: string;
  Code?: string;
  enText?: string;
}

export interface RawQuakeDetail {
  Control?: { Title?: string; Status?: string };
  Head: {
    Title: string;
    ReportDateTime: string;
    EventID: string;
    InfoType?: string;
    Headline?: { Text?: string };
    ValidDateTime?: string;
  };
  Body: {
    Earthquake?: RawQuakeEarthquake | RawQuakeEarthquake[];
    Intensity?: { Observation?: { MaxInt?: string; Pref?: RawIntensityPref[] } };
    Comments?: { ForecastComment?: RawComment; VarComment?: RawComment; FreeFormComment?: string };
    Text?: string;
  };
}

// ─── tsunami ─────────────────────────────────────────────────────────────────

export interface RawTsunamiItem {
  Area: { Name: string; Code: string; enName?: string };
  Category?: {
    Kind?: { Name?: string; Code?: string; enName?: string };
    LastKind?: { Name?: string; Code?: string; enName?: string };
  };
  FirstHeight?: { ArrivalTime?: string; Condition?: string; Revise?: string };
  MaxHeight?: { TsunamiHeight?: string; Condition?: string; Revise?: string };
}

export interface RawTsunamiStation {
  Name: string;
  Code?: string;
  enName?: string;
  FirstHeight?: { ArrivalTime?: string; Initial?: string; Condition?: string };
  MaxHeight?: { DateTime?: string; TsunamiHeight?: string; Condition?: string };
}

export interface RawTsunamiDetail {
  Head: {
    Title: string;
    ReportDateTime: string;
    ValidDateTime?: string | null;
    EventID: string;
    InfoType?: string;
    Headline?: { Text?: string };
  };
  Body: {
    Tsunami?: {
      Forecast?: { Item?: RawTsunamiItem[] };
      Observation?: { Item?: Array<{ Area?: { Name?: string }; Station?: RawTsunamiStation[] }> };
    };
    Earthquake?: RawQuakeEarthquake | RawQuakeEarthquake[];
    Comments?: { WarningComment?: RawComment; FreeFormComment?: string };
    Text?: string;
  };
}

// ─── volcano ─────────────────────────────────────────────────────────────────

export interface RawVolcanoListEntry {
  code: string;
  latlon?: [string, string];
  name_jp: string;
  name_en: string;
}

export interface RawVolcanoWarning {
  reportDatetime: string;
  eventId: string;
  areas?: string[];
  volcanoInfos: Array<{
    type: string;
    items: Array<{
      name: string;
      code: string;
      lastCode?: string;
      condition?: string;
      areas: Array<{ name: string; code: string }>;
    }>;
  }>;
}
