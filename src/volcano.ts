import { fetchJson, TTL } from "./http.js";
import { romajiKey, tidy, toHiragana } from "./text.js";
import type { RawVolcanoListEntry, RawVolcanoWarning } from "./types.js";

export interface VolcanoStatus {
  volcano_code: string;
  name: string;
  name_en: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Volcanic Alert Level 1–5 (噴火警戒レベル); null for volcanoes without a level system. */
  alert_level: number | null;
  /** JMA wording, e.g. レベル２（火口周辺規制）, 火口周辺危険, 周辺海域警戒. */
  status: string;
  /** 継続 (unchanged), 引上げ (raised), 引下げ (lowered), 切替 (switched) … */
  change: string | null;
  /** False when the latest bulletin downgraded to an eruption forecast (噴火予報), i.e. no warning now. */
  warning_in_effect: boolean;
  municipalities: Array<{ warning: string; names: string[] }>;
  actions: string[];
  report_datetime: string;
}

function levelOf(text: string): number | null {
  const m = /レベル(\d)/.exec(text.normalize("NFKC"));
  return m ? Number(m[1]) : null;
}

export function parseVolcanoWarnings(warnings: RawVolcanoWarning[], list: RawVolcanoListEntry[]): VolcanoStatus[] {
  const meta = new Map(list.map((v) => [v.code, v]));
  const out: VolcanoStatus[] = [];
  for (const w of warnings) {
    const target = w.volcanoInfos.find((i) => i.type.includes("対象火山"));
    const item = target?.items[0];
    if (!item) continue;
    const volcanoCode = item.areas[0]?.code ?? w.eventId;
    const v = meta.get(volcanoCode);
    const muniInfo = w.volcanoInfos.find((i) => i.type.endsWith("（対象市町村等）"));
    const actionInfo = w.volcanoInfos.find((i) => i.type.includes("防災対応"));
    const municipalities = (muniInfo?.items ?? []).map((i) => ({ warning: tidy(i.name) ?? i.name, names: i.areas.map((a) => a.name) }));
    out.push({
      volcano_code: volcanoCode,
      name: v?.name_jp ?? item.areas[0]?.name ?? volcanoCode,
      name_en: v?.name_en ?? null,
      latitude: v?.latlon ? Number(v.latlon[0]) : null,
      longitude: v?.latlon ? Number(v.latlon[1]) : null,
      alert_level: levelOf(item.name),
      status: tidy(item.name) ?? item.name,
      change: item.condition ?? null,
      warning_in_effect: municipalities.length > 0 ? municipalities.some((m) => !m.warning.startsWith("噴火予報")) : true,
      municipalities,
      actions: (actionInfo?.items ?? []).map((i) => tidy(i.name) ?? i.name),
      report_datetime: w.reportDatetime,
    });
  }
  return out.sort(
    (a, b) =>
      Number(b.warning_in_effect) - Number(a.warning_in_effect) ||
      (b.alert_level ?? 0) - (a.alert_level ?? 0) ||
      b.report_datetime.localeCompare(a.report_datetime)
  );
}

function matchesVolcano(query: string, v: { code: string; name_jp?: string; name_en?: string }): boolean {
  const q = query.normalize("NFKC").trim();
  if (q === v.code) return true;
  if (/[a-z]/i.test(q)) {
    const key = romajiKey(q);
    return key.length >= 3 && romajiKey(v.name_en ?? "").includes(key);
  }
  return q !== "" && toHiragana((v.name_jp ?? "").normalize("NFKC")).includes(toHiragana(q));
}

export async function getVolcanoWarnings(options: { volcano?: string } = {}): Promise<{
  volcanoes: VolcanoStatus[];
  query_matches_without_warning: Array<{ volcano_code: string; name: string; name_en: string }>;
  source_url: string;
}> {
  const [warnings, list] = await Promise.all([
    fetchJson<RawVolcanoWarning[]>("volcano/data/warning.json", TTL.volcano),
    fetchJson<RawVolcanoListEntry[]>("volcano/const/volcano_list.json", TTL.constant).catch(() => [] as RawVolcanoListEntry[]),
  ]);

  let volcanoes = parseVolcanoWarnings(Array.isArray(warnings) ? warnings : [], Array.isArray(list) ? list : []);
  let withoutWarning: Array<{ volcano_code: string; name: string; name_en: string }> = [];

  const query = options.volcano?.trim();
  if (query) {
    volcanoes = volcanoes.filter((v) =>
      matchesVolcano(query, { code: v.volcano_code, name_jp: v.name, name_en: v.name_en ?? "" })
    );
    const listed = new Set(volcanoes.map((v) => v.volcano_code));
    withoutWarning = (Array.isArray(list) ? list : [])
      .filter((v) => v.code !== "900" && !listed.has(v.code) && matchesVolcano(query, v))
      .map((v) => ({ volcano_code: v.code, name: v.name_jp, name_en: v.name_en }));
  }

  return {
    volcanoes,
    query_matches_without_warning: withoutWarning,
    source_url: "https://www.jma.go.jp/bosai/map.html#contents=volcano",
  };
}
