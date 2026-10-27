import { fetchJson, TTL } from "./http.js";
import { resolveForOffice } from "./areas.js";
import { summarizeCandidate } from "./forecast.js";
import { SEVERITY_RANK, WARNING_CODES, type WarningSeverity } from "./codes.js";
import { tidy } from "./text.js";
import type { AreaIndex } from "./areas.js";
import type { RawWarningItem, RawWarningReport } from "./types.js";

// Statuses that mean the item is no longer in effect.
const INACTIVE_STATUS = new Set(["解除", "発表警報・注意報はなし"]);

export interface ActiveWarning {
  code: string;
  name: string;
  name_en: string;
  severity: WarningSeverity | "unknown";
  alert_level: number | null;
  /** JMA status: 発表 (issued), 継続 (continuing), 警報から注意報 (downgraded) etc. */
  status: string;
  /** Extra phenomena JMA attaches, e.g. 竜巻 (tornado), ひょう (hail), うねり (swell). */
  additions: string[];
  issued_in_report: string;
}

export interface AreaWarnings {
  code: string;
  level: "class10" | "class20";
  name: string;
  name_en: string | null;
  warnings: ActiveWarning[];
}

export interface WarningsResult {
  office: { code: string; name: string };
  resolved: { query: string; code: string; level: string; name: string; name_en: string; path: string };
  other_candidates: Array<{ code: string; name: string; name_en: string; path: string }>;
  latest_report_datetime: string | null;
  /** Distinct warnings/advisories in effect anywhere in the selected area, most severe first. */
  in_effect: Array<{
    code: string;
    name: string;
    name_en: string;
    severity: string;
    alert_level: number | null;
    /** Number of class10 regions (一次細分区域) and municipalities (市町村等) it covers. */
    region_count: number;
    municipality_count: number;
  }>;
  headlines: Array<{ report_datetime: string; text: string }>;
  areas: AreaWarnings[];
  areas_checked: number;
  source_url: string;
}

/**
 * The r8 warning feed is a list of bulletins, one stream per bulletin type
 * (dataTypeCode). Only the newest bulletin of each type reflects the current
 * state; older ones of the same type are superseded.
 */
export function latestPerType(reports: RawWarningReport[]): RawWarningReport[] {
  const latest = new Map<string, RawWarningReport>();
  for (const r of reports) {
    const key = r.dataTypeCode ?? "unknown";
    const prev = latest.get(key);
    if (!prev || r.reportDatetime > prev.reportDatetime) latest.set(key, r);
  }
  return [...latest.values()].sort((a, b) => b.reportDatetime.localeCompare(a.reportDatetime));
}

function describe(code: string): Pick<ActiveWarning, "name" | "name_en" | "severity" | "alert_level"> {
  const info = WARNING_CODES[code];
  if (!info) return { name: `不明なコード ${code}`, name_en: `Unknown code ${code}`, severity: "unknown", alert_level: null };
  return { name: info.ja, name_en: info.en, severity: info.severity, alert_level: info.alert_level };
}

function rank(w: { severity: string }): number {
  return SEVERITY_RANK[w.severity as WarningSeverity] ?? 0;
}

export function collectWarnings(
  reports: RawWarningReport[],
  index: AreaIndex | null,
  keepArea: (code: string, level: "class10" | "class20") => boolean = () => true
): { areas: AreaWarnings[]; areasChecked: number; headlines: WarningsResult["headlines"] } {
  const current = latestPerType(reports);
  const byArea = new Map<string, AreaWarnings>();
  const checked = new Set<string>();
  const headlines: WarningsResult["headlines"] = [];

  for (const report of current) {
    let reportHasActive = false;
    const groups: Array<[RawWarningItem[] | undefined, "class10" | "class20"]> = [
      [report.warning?.class10Items, "class10"],
      [report.warning?.class20Items, "class20"],
    ];
    for (const [items, level] of groups) {
      for (const item of items ?? []) {
        if (!keepArea(item.areaCode, level)) continue;
        checked.add(`${level}:${item.areaCode}`);
        for (const kind of item.kinds ?? []) {
          if (!kind.code || INACTIVE_STATUS.has(kind.status)) continue;
          reportHasActive = true;
          const key = `${level}:${item.areaCode}`;
          let entry = byArea.get(key);
          if (!entry) {
            const names = index?.nameOf(item.areaCode);
            entry = {
              code: item.areaCode,
              level,
              name: names?.name ?? item.areaCode,
              name_en: names?.name_en ?? null,
              warnings: [],
            };
            byArea.set(key, entry);
          }
          if (entry.warnings.some((w) => w.code === kind.code)) continue;
          entry.warnings.push({
            code: kind.code,
            ...describe(kind.code),
            status: kind.status,
            additions: kind.additions ?? [],
            issued_in_report: report.reportDatetime,
          });
        }
      }
    }
    const text = tidy(report.headlineText);
    if (reportHasActive && text) headlines.push({ report_datetime: report.reportDatetime, text });
  }

  const areas = [...byArea.values()]
    .map((a) => ({ ...a, warnings: a.warnings.sort((x, y) => rank(y) - rank(x) || x.code.localeCompare(y.code)) }))
    .sort((a, b) => (a.level === b.level ? a.code.localeCompare(b.code) : a.level === "class10" ? -1 : 1));

  return { areas, areasChecked: checked.size, headlines };
}

/** Current warnings and advisories (警報・注意報) for a place name or JMA area code. */
export async function getWarnings(query: string): Promise<WarningsResult> {
  const resolved = await resolveForOffice(query);
  const { index, match, office_code } = resolved;

  const reports = await fetchJson<RawWarningReport[]>(`warning/data/r8/${office_code}.json`, TTL.warning);
  const list = Array.isArray(reports) ? reports : [];

  // Narrow to the requested sub-area: a class10 region and its municipalities,
  // or one municipality plus the region it belongs to.
  let keep: (code: string, level: "class10" | "class20") => boolean = () => true;
  if (match.level !== "office") {
    const focusClass10 = index.class10Of(match.code)?.code ?? null;
    const focusClass20 = match.level === "class20" ? match.code : null;
    keep = (code, level) => {
      if (level === "class10") return focusClass10 === null || code === focusClass10;
      if (focusClass20) return code === focusClass20;
      return focusClass10 === null || index.class10Of(code)?.code === focusClass10;
    };
  }

  const { areas, areasChecked, headlines } = collectWarnings(list, index, keep);

  const distinct = new Map<string, WarningsResult["in_effect"][number]>();
  for (const area of areas) {
    for (const w of area.warnings) {
      const d = distinct.get(w.code) ?? {
        code: w.code,
        name: w.name,
        name_en: w.name_en,
        severity: w.severity,
        alert_level: w.alert_level,
        region_count: 0,
        municipality_count: 0,
      };
      if (area.level === "class10") d.region_count += 1;
      else d.municipality_count += 1;
      distinct.set(w.code, d);
    }
  }

  return {
    office: { code: office_code, name: resolved.office_name },
    resolved: { query, code: match.code, level: match.level, name: match.name, name_en: match.name_en, path: match.path },
    other_candidates: resolved.other_candidates.map(summarizeCandidate),
    latest_report_datetime: list.reduce<string | null>((max, r) => (max === null || r.reportDatetime > max ? r.reportDatetime : max), null),
    in_effect: [...distinct.values()].sort((a, b) => rank(b) - rank(a) || a.code.localeCompare(b.code)),
    headlines,
    areas,
    areas_checked: areasChecked,
    source_url: `https://www.jma.go.jp/bosai/warning/#area_type=offices&area_code=${office_code}`,
  };
}
