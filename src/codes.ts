// Code tables that JMA's JSON refers to but does not spell out.

// ─── Warning / advisory codes (警報・注意報) ──────────────────────────────────
//
// From the code table embedded in https://www.jma.go.jp/bosai/warning/ for the
// warning system JMA introduced on 2026-05-28 (警戒レベル付きの新しい防災気象情報).
// Severity tiers: 注意報 = advisory, 警報 = warning, 危険警報 = urgent warning
// (new, alert level 4), 特別警報 = emergency warning. Only heavy rain, landslide
// and storm surge carry an official 警戒レベル (alert level) in their names.

export type WarningSeverity = "advisory" | "warning" | "urgent_warning" | "emergency_warning";

export interface WarningCodeInfo {
  ja: string;
  en: string;
  severity: WarningSeverity;
  /** 警戒レベル 2–5 for heavy rain, landslide and storm surge; null otherwise. */
  alert_level: number | null;
}

const SEVERITY_EN: Record<WarningSeverity, string> = {
  advisory: "Advisory",
  warning: "Warning",
  urgent_warning: "Urgent Warning",
  emergency_warning: "Emergency Warning",
};

function w(ja: string, element: string, severity: WarningSeverity, alertLevel: number | null = null): WarningCodeInfo {
  const prefix = alertLevel ? `Level ${alertLevel} ` : "";
  return { ja, en: `${prefix}${element} ${SEVERITY_EN[severity]}`, severity, alert_level: alertLevel };
}

export const WARNING_CODES: Readonly<Record<string, WarningCodeInfo>> = {
  // Heavy rain (大雨)
  "10": w("レベル２大雨注意報", "Heavy Rain", "advisory", 2),
  "03": w("レベル３大雨警報", "Heavy Rain", "warning", 3),
  "43": w("レベル４大雨危険警報", "Heavy Rain", "urgent_warning", 4),
  "33": w("レベル５大雨特別警報", "Heavy Rain", "emergency_warning", 5),
  // Landslide (土砂災害)
  "29": w("レベル２土砂災害注意報", "Landslide", "advisory", 2),
  "09": w("レベル３土砂災害警報", "Landslide", "warning", 3),
  "49": w("レベル４土砂災害危険警報", "Landslide", "urgent_warning", 4),
  "39": w("レベル５土砂災害特別警報", "Landslide", "emergency_warning", 5),
  // Storm surge (高潮)
  "19": w("レベル２高潮注意報", "Storm Surge", "advisory", 2),
  "08": w("レベル３高潮警報", "Storm Surge", "warning", 3),
  "48": w("レベル４高潮危険警報", "Storm Surge", "urgent_warning", 4),
  "38": w("レベル５高潮特別警報", "Storm Surge", "emergency_warning", 5),
  // Wind (強風 / 暴風)
  "15": w("強風注意報", "Gale", "advisory"),
  "05": w("暴風警報", "Storm", "warning"),
  "35": w("暴風特別警報", "Storm", "emergency_warning"),
  // Wind with snow (風雪 / 暴風雪)
  "13": w("風雪注意報", "Gale and Snow", "advisory"),
  "02": w("暴風雪警報", "Snowstorm", "warning"),
  "32": w("暴風雪特別警報", "Snowstorm", "emergency_warning"),
  // Heavy snow (大雪)
  "12": w("大雪注意報", "Heavy Snow", "advisory"),
  "06": w("大雪警報", "Heavy Snow", "warning"),
  "36": w("大雪特別警報", "Heavy Snow", "emergency_warning"),
  // High waves (波浪)
  "16": w("波浪注意報", "High Wave", "advisory"),
  "07": w("波浪警報", "High Wave", "warning"),
  "37": w("波浪特別警報", "High Wave", "emergency_warning"),
  // Advisory-only elements
  "14": w("雷注意報", "Thunderstorm", "advisory"),
  "17": w("融雪注意報", "Snow Melting", "advisory"),
  "20": w("濃霧注意報", "Dense Fog", "advisory"),
  "21": w("乾燥注意報", "Dry Air", "advisory"),
  "22": w("なだれ注意報", "Avalanche", "advisory"),
  "23": w("低温注意報", "Low Temperature", "advisory"),
  "24": w("霜注意報", "Frost", "advisory"),
  "25": w("着氷注意報", "Ice Accretion", "advisory"),
  "26": w("着雪注意報", "Snow Accretion", "advisory"),
  // Codes from the pre-2026-05-28 system that may still appear in old data.
  "04": w("洪水警報", "Flood", "warning"),
  "18": w("洪水注意報", "Flood", "advisory"),
};

export const SEVERITY_RANK: Record<WarningSeverity, number> = {
  advisory: 1,
  warning: 2,
  urgent_warning: 3,
  emergency_warning: 4,
};

// ─── Prefectures (都道府県, JIS X 0401 codes as used in quake data) ────────────

export interface Prefecture {
  code: string;
  ja: string;
  en: string;
  kana: string;
}

export const PREFECTURES: readonly Prefecture[] = [
  { code: "01", ja: "北海道", en: "Hokkaido", kana: "ほっかいどう" },
  { code: "02", ja: "青森県", en: "Aomori", kana: "あおもりけん" },
  { code: "03", ja: "岩手県", en: "Iwate", kana: "いわてけん" },
  { code: "04", ja: "宮城県", en: "Miyagi", kana: "みやぎけん" },
  { code: "05", ja: "秋田県", en: "Akita", kana: "あきたけん" },
  { code: "06", ja: "山形県", en: "Yamagata", kana: "やまがたけん" },
  { code: "07", ja: "福島県", en: "Fukushima", kana: "ふくしまけん" },
  { code: "08", ja: "茨城県", en: "Ibaraki", kana: "いばらきけん" },
  { code: "09", ja: "栃木県", en: "Tochigi", kana: "とちぎけん" },
  { code: "10", ja: "群馬県", en: "Gunma", kana: "ぐんまけん" },
  { code: "11", ja: "埼玉県", en: "Saitama", kana: "さいたまけん" },
  { code: "12", ja: "千葉県", en: "Chiba", kana: "ちばけん" },
  { code: "13", ja: "東京都", en: "Tokyo", kana: "とうきょうと" },
  { code: "14", ja: "神奈川県", en: "Kanagawa", kana: "かながわけん" },
  { code: "15", ja: "新潟県", en: "Niigata", kana: "にいがたけん" },
  { code: "16", ja: "富山県", en: "Toyama", kana: "とやまけん" },
  { code: "17", ja: "石川県", en: "Ishikawa", kana: "いしかわけん" },
  { code: "18", ja: "福井県", en: "Fukui", kana: "ふくいけん" },
  { code: "19", ja: "山梨県", en: "Yamanashi", kana: "やまなしけん" },
  { code: "20", ja: "長野県", en: "Nagano", kana: "ながのけん" },
  { code: "21", ja: "岐阜県", en: "Gifu", kana: "ぎふけん" },
  { code: "22", ja: "静岡県", en: "Shizuoka", kana: "しずおかけん" },
  { code: "23", ja: "愛知県", en: "Aichi", kana: "あいちけん" },
  { code: "24", ja: "三重県", en: "Mie", kana: "みえけん" },
  { code: "25", ja: "滋賀県", en: "Shiga", kana: "しがけん" },
  { code: "26", ja: "京都府", en: "Kyoto", kana: "きょうとふ" },
  { code: "27", ja: "大阪府", en: "Osaka", kana: "おおさかふ" },
  { code: "28", ja: "兵庫県", en: "Hyogo", kana: "ひょうごけん" },
  { code: "29", ja: "奈良県", en: "Nara", kana: "ならけん" },
  { code: "30", ja: "和歌山県", en: "Wakayama", kana: "わかやまけん" },
  { code: "31", ja: "鳥取県", en: "Tottori", kana: "とっとりけん" },
  { code: "32", ja: "島根県", en: "Shimane", kana: "しまねけん" },
  { code: "33", ja: "岡山県", en: "Okayama", kana: "おかやまけん" },
  { code: "34", ja: "広島県", en: "Hiroshima", kana: "ひろしまけん" },
  { code: "35", ja: "山口県", en: "Yamaguchi", kana: "やまぐちけん" },
  { code: "36", ja: "徳島県", en: "Tokushima", kana: "とくしまけん" },
  { code: "37", ja: "香川県", en: "Kagawa", kana: "かがわけん" },
  { code: "38", ja: "愛媛県", en: "Ehime", kana: "えひめけん" },
  { code: "39", ja: "高知県", en: "Kochi", kana: "こうちけん" },
  { code: "40", ja: "福岡県", en: "Fukuoka", kana: "ふくおかけん" },
  { code: "41", ja: "佐賀県", en: "Saga", kana: "さがけん" },
  { code: "42", ja: "長崎県", en: "Nagasaki", kana: "ながさきけん" },
  { code: "43", ja: "熊本県", en: "Kumamoto", kana: "くまもとけん" },
  { code: "44", ja: "大分県", en: "Oita", kana: "おおいたけん" },
  { code: "45", ja: "宮崎県", en: "Miyazaki", kana: "みやざきけん" },
  { code: "46", ja: "鹿児島県", en: "Kagoshima", kana: "かごしまけん" },
  { code: "47", ja: "沖縄県", en: "Okinawa", kana: "おきなわけん" },
];

export const PREFECTURE_BY_CODE: ReadonlyMap<string, Prefecture> = new Map(PREFECTURES.map((p) => [p.code, p]));

// ─── Seismic intensity (震度, JMA scale) ──────────────────────────────────────

export const INTENSITY_SCALE = ["1", "2", "3", "4", "5-", "5+", "6-", "6+", "7"] as const;
export type Intensity = (typeof INTENSITY_SCALE)[number];

const INTENSITY_LABELS: Record<Intensity, [ja: string, en: string]> = {
  "1": ["震度1", "1"],
  "2": ["震度2", "2"],
  "3": ["震度3", "3"],
  "4": ["震度4", "4"],
  "5-": ["震度5弱", "5 Lower"],
  "5+": ["震度5強", "5 Upper"],
  "6-": ["震度6弱", "6 Lower"],
  "6+": ["震度6強", "6 Upper"],
  "7": ["震度7", "7"],
};

/** Rank on the JMA scale (1 → 1 … 7 → 9); 0 for empty/unknown values. */
export function intensityRank(value: string | null | undefined): number {
  const i = INTENSITY_SCALE.indexOf((value ?? "") as Intensity);
  return i + 1;
}

export interface IntensityValue {
  /** JMA code: "1"–"4", "5-", "5+", "6-", "6+", "7". */
  value: string;
  ja: string;
  en: string;
}

export function intensity(value: string | null | undefined): IntensityValue | null {
  if (!value) return null;
  const labels = INTENSITY_LABELS[value as Intensity];
  if (!labels) return { value, ja: value, en: value };
  return { value, ja: labels[0], en: labels[1] };
}
