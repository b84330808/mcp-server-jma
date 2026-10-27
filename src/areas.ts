import { fetchJson, JmaError, TTL } from "./http.js";
import { PREFECTURES } from "./codes.js";
import { romajiKey, toHiragana } from "./text.js";
import type { AreaLevel, AreaMatch, RawAreaEntry, RawAreaJson } from "./types.js";

export const AREA_JSON_PATH = "common/const/area.json";

const LEVELS: ReadonlyArray<[keyof RawAreaJson, AreaLevel]> = [
  ["centers", "center"],
  ["offices", "office"],
  ["class10s", "class10"],
  ["class15s", "class15"],
  ["class20s", "class20"],
];

// Broader areas win ties: "Tokyo" should mean the prefecture, not 東京地方.
const LEVEL_RANK: Record<AreaLevel, number> = { office: 0, center: 1, class10: 2, class15: 3, class20: 4 };
// …except when the query is an address that contains several names
// (東京都渋谷区): then the most specific name wins.
const LEVEL_DEPTH: Record<AreaLevel, number> = { center: 0, office: 1, class10: 2, class15: 3, class20: 4 };

const JA_SUFFIXES = ["地方", "地域", "都", "府", "県", "市", "区", "町", "村"];
const KANA_SUFFIXES: Record<string, string[]> = {
  都: ["と"],
  府: ["ふ"],
  県: ["けん"],
  市: ["し"],
  区: ["く"],
  町: ["ちょう", "まち"],
  村: ["むら", "そん"],
};
const EN_SUFFIXES = /\b(city|town|village|ward|region|area|prefecture|islands?)\b/gi;

interface AreaRecord {
  code: string;
  level: AreaLevel;
  entry: RawAreaEntry;
}

interface SearchKey {
  record: AreaRecord;
  ja: string;
  jaBase: string;
  kana: string | null;
  kanaBase: string | null;
  en: string;
  enBase: string;
}

function normJa(text: string): string {
  return toHiragana(text.normalize("NFKC")).replace(/\s+/g, "").toLowerCase();
}

function stripParens(text: string): string {
  return text.replace(/[（(][^）)]*[）)]/g, "");
}

function stripJaSuffix(name: string): { base: string; suffix: string | null } {
  const plain = stripParens(name);
  for (const suffix of JA_SUFFIXES) {
    if (plain.length > suffix.length + 1 && plain.endsWith(suffix)) {
      return { base: plain.slice(0, -suffix.length), suffix };
    }
  }
  return { base: plain, suffix: null };
}

function stripKanaSuffix(kana: string, suffix: string | null): string {
  for (const k of (suffix && KANA_SUFFIXES[suffix]) || []) {
    if (kana.length > k.length + 1 && kana.endsWith(k)) return kana.slice(0, -k.length);
  }
  return kana;
}

function isKana(text: string): boolean {
  return /^[ぁ-ゖー]+$/.test(text);
}

export class AreaIndex {
  private readonly records = new Map<string, AreaRecord>();
  private readonly keys: SearchKey[] = [];

  constructor(private readonly raw: RawAreaJson) {
    for (const [group, level] of LEVELS) {
      for (const [code, entry] of Object.entries(raw[group] ?? {})) {
        const record: AreaRecord = { code, level, entry };
        // A code can appear at more than one level (e.g. 014030 is both an office and a class10).
        if (!this.records.has(code) || LEVEL_RANK[level] < LEVEL_RANK[this.records.get(code)!.level]) {
          this.records.set(code, record);
        }
        this.keys.push(this.makeKey(record, entry.kana ?? null));
      }
    }
    // area.json only has readings for municipalities; add prefecture readings.
    for (const pref of PREFECTURES) {
      const target =
        this.records.get(`${pref.code}0000`) ??
        (pref.code === "01" ? this.records.get("010100") : undefined) ??
        (pref.code === "46" ? this.records.get("460100") : undefined) ??
        (pref.code === "47" ? this.records.get("011100") : undefined);
      if (target) this.keys.push(this.makeKey(target, pref.kana, pref.ja));
    }
  }

  private makeKey(record: AreaRecord, kana: string | null, nameOverride?: string): SearchKey {
    const name = nameOverride ?? record.entry.name;
    const { base, suffix } = stripJaSuffix(name);
    const kanaNorm = kana ? normJa(kana) : null;
    return {
      record,
      ja: normJa(name),
      jaBase: normJa(base),
      kana: kanaNorm,
      kanaBase: kanaNorm ? stripKanaSuffix(kanaNorm, suffix) : null,
      en: romajiKey(record.entry.enName),
      enBase: romajiKey(record.entry.enName.replace(EN_SUFFIXES, "")),
    };
  }

  get(code: string): AreaRecord | undefined {
    return this.records.get(code);
  }

  /** Walks up the parent chain (class20 → class15 → class10 → office → center). */
  ancestors(code: string): AreaRecord[] {
    const start = this.records.get(code);
    return start ? this.chainFrom(start) : [];
  }

  private chainFrom(start: AreaRecord): AreaRecord[] {
    const chain: AreaRecord[] = [];
    let current: AreaRecord | undefined = start;
    const seen = new Set<string>();
    while (current && !seen.has(current.code)) {
      seen.add(current.code);
      chain.push(current);
      const parent = current.entry.parent;
      if (!parent) break;
      current = this.findParent(parent, current.level);
    }
    return chain;
  }

  // Parent codes are looked up one level up first, because codes repeat across levels.
  private findParent(code: string, childLevel: AreaLevel): AreaRecord | undefined {
    const order: Array<[keyof RawAreaJson, AreaLevel]> = [...LEVELS].reverse();
    const childIdx = order.findIndex(([, l]) => l === childLevel);
    for (const [group, level] of order.slice(childIdx + 1)) {
      const entry = this.raw[group]?.[code];
      if (entry) return { code, level, entry };
    }
    return this.records.get(code);
  }

  officeOf(code: string): AreaRecord | null {
    return this.ancestors(code).find((r) => r.level === "office") ?? null;
  }

  class10Of(code: string): AreaRecord | null {
    return this.ancestors(code).find((r) => r.level === "class10") ?? null;
  }

  nameOf(code: string): { name: string; name_en: string } | null {
    const r = this.records.get(code);
    return r ? { name: r.entry.name, name_en: r.entry.enName } : null;
  }

  toMatch(record: AreaRecord, score: number): AreaMatch {
    const chain = this.chainFrom(record);
    const office = record.level === "office" ? record : chain.find((r) => r.level === "office") ?? null;
    return {
      code: record.code,
      level: record.level,
      name: record.entry.name,
      name_en: record.entry.enName,
      kana: record.entry.kana ?? null,
      path: chain
        .slice()
        .reverse()
        .map((r) => r.entry.name)
        .join(" > "),
      office_code: office?.code ?? null,
      office_name: office?.entry.name ?? null,
      score,
    };
  }

  /**
   * Finds areas by JMA code, kanji name, kana reading or romaji.
   * Results are ranked by match quality first, then by how broad the area is.
   */
  search(query: string, limit = 5): AreaMatch[] {
    const raw = query.trim();
    if (raw === "") return [];

    const codeQuery = raw.normalize("NFKC");
    if (/^\d{6,7}$/.test(codeQuery)) {
      const exact = this.records.get(codeQuery);
      return exact ? [this.toMatch(exact, 100)] : [];
    }

    const qJa = normJa(raw);
    const qJaBase = normJa(stripJaSuffix(raw.normalize("NFKC")).base);
    const qKana = isKana(qJa) ? qJa : null;
    const hasLatin = /[a-z]/i.test(raw.normalize("NFKC"));
    const qEn = hasLatin ? romajiKey(raw) : "";
    const qEnBase = hasLatin ? romajiKey(raw.normalize("NFKC").replace(EN_SUFFIXES, "")) : "";

    const best = new Map<string, { record: AreaRecord; score: number }>();
    for (const key of this.keys) {
      let score = 0;
      const depth = LEVEL_DEPTH[key.record.level];
      if (hasLatin) {
        score = Math.max(score, scoreText(qEn, qEnBase, key.en, key.enBase, 3, depth));
      } else {
        score = Math.max(score, scoreText(qJa, qJaBase, key.ja, key.jaBase, 2, depth));
        if (qKana && key.kana && key.kanaBase) {
          score = Math.max(score, scoreText(qKana, qKana, key.kana, key.kanaBase, 2, depth));
        }
      }
      if (score === 0) continue;
      const id = `${key.record.level}:${key.record.code}`;
      const prev = best.get(id);
      if (!prev || prev.score < score) best.set(id, { record: key.record, score });
    }

    return [...best.values()]
      .sort(
        (a, b) =>
          b.score - a.score ||
          LEVEL_RANK[a.record.level] - LEVEL_RANK[b.record.level] ||
          a.record.code.localeCompare(b.record.code)
      )
      .slice(0, limit)
      .map(({ record, score }) => this.toMatch(record, score));
  }
}

/**
 * 100 exact · 90 same name without suffix (東京 ↔ 東京都, Shibuya ↔ Shibuya City)
 * · 70 prefix · 50 substring · 30–49 the query contains this whole name (addresses),
 * longer and more specific names first.
 */
function scoreText(q: string, qBase: string, name: string, nameBase: string, minLen: number, depth: number): number {
  if (!q || !name) return 0;
  if (q === name) return 100;
  if (q === nameBase || qBase === nameBase || qBase === name) return 90;
  if (q.length >= minLen && name.startsWith(q)) return 70;
  if (q.length >= minLen && name.includes(q)) return 50;
  if (nameBase.length >= minLen && q.includes(nameBase)) return 30 + Math.min(nameBase.length, 15) + depth;
  return 0;
}

const indexCache = new WeakMap<RawAreaJson, AreaIndex>();

export async function loadAreaIndex(): Promise<AreaIndex> {
  const raw = await fetchJson<RawAreaJson>(AREA_JSON_PATH, TTL.constant);
  let index = indexCache.get(raw);
  if (!index) {
    index = new AreaIndex(raw);
    indexCache.set(raw, index);
  }
  return index;
}

export async function findAreas(query: string, limit = 5): Promise<AreaMatch[]> {
  const index = await loadAreaIndex();
  return index.search(query, limit);
}

export interface ResolvedArea {
  index: AreaIndex;
  match: AreaMatch;
  office_code: string;
  office_name: string;
  /** Other plausible readings of the query that point to a different place. */
  other_candidates: AreaMatch[];
}

/**
 * Resolves a place name or code to the forecast office (府県予報区) that publishes
 * forecasts and warnings for it. Regional centers (e.g. 北海道地方) are too broad and
 * produce an AREA_TOO_BROAD error that lists the offices to choose from.
 */
export async function resolveForOffice(query: string): Promise<ResolvedArea> {
  const index = await loadAreaIndex();
  const matches = index.search(query, 8);
  if (matches.length === 0) {
    throw new JmaError(
      {
        code: "AREA_NOT_FOUND",
        message: `No JMA area matches "${query}". Try a prefecture or municipality name in Japanese (東京都, 札幌市), kana (さっぽろ) or romaji (Sapporo), or a JMA area code from jma_find_area.`,
      },
      "Area not found"
    );
  }

  const top = matches[0];
  if (top.office_code === null) {
    const center = index.get(top.code);
    const offices = (center?.entry.children ?? [])
      .map((code) => index.get(code))
      .filter((r): r is NonNullable<typeof r> => r !== undefined)
      .map((r) => index.toMatch(r, top.score));
    throw new JmaError(
      {
        code: "AREA_TOO_BROAD",
        message: `"${query}" matched the regional center ${top.name} (${top.name_en}), which has no single forecast. Call again with one of these forecast offices (area code or name).`,
        candidates: offices.map((o) => ({ code: o.code, name: o.name, name_en: o.name_en })),
      },
      "Area too broad"
    );
  }

  const others = matches
    .slice(1)
    .filter((m) => m.score === top.score && m.office_code !== top.office_code)
    .slice(0, 4);

  return {
    index,
    match: top,
    office_code: top.office_code,
    office_name: top.office_name ?? top.name,
    other_candidates: others,
  };
}
