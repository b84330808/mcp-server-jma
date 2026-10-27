import { getWarnings, latestPerType } from "../src/warnings";
import { WARNING_CODES } from "../src/codes";
import { fixture, serveFixtures } from "./helpers";
import type { RawWarningReport } from "../src/types";

jest.mock("axios");

beforeEach(() => {
  serveFixtures();
});

describe("latestPerType", () => {
  it("keeps only the newest bulletin of each type", () => {
    const reports = fixture<RawWarningReport[]>("warning_data_r8_016000.json");
    const latest = latestPerType(reports);
    expect(latest.map((r) => r.dataTypeCode).sort()).toEqual(["VPWW55", "VPWW56", "VPWW58", "VPWW59", "VPWW61"]);
    expect(latest[0].reportDatetime).toBe("2026-10-27T03:50:00+09:00");
  });
});

describe("getWarnings", () => {
  it("lists what is in effect across a prefecture and ignores lifted items", async () => {
    const w = await getWarnings("東京都");
    expect(w.office.code).toBe("130000");
    expect(w.in_effect.map((x) => x.code).sort()).toEqual(["15", "16", "20"]);
    expect(w.in_effect.find((x) => x.code === "15")).toMatchObject({
      name: "強風注意報",
      name_en: "Gale Advisory",
      severity: "advisory",
      alert_level: null,
      region_count: 2,
    });
    // 大雨注意報 (10) and 土砂災害注意報 (29) were lifted (解除) on 2026-10-01.
    expect(w.areas.flatMap((a) => a.warnings).some((x) => x.code === "10" || x.code === "29")).toBe(false);
    expect(w.headlines.map((h) => h.text)).toEqual(
      expect.arrayContaining(["伊豆諸島北部、伊豆諸島南部では、強風に注意してください。"])
    );
    expect(w.latest_report_datetime).toBe("2026-10-27T10:04:00+09:00");
  });

  it("names areas from area.json", async () => {
    const w = await getWarnings("東京都");
    const south = w.areas.find((a) => a.code === "130030")!;
    expect(south).toMatchObject({ level: "class10", name: "伊豆諸島南部" });
    expect(south.warnings.map((x) => x.code)).toEqual(["15", "16", "20"]);
  });

  it("narrows to a municipality and reports extra hazards", async () => {
    const w = await getWarnings("Sapporo");
    expect(w.office.code).toBe("016000");
    expect(w.resolved.code).toBe("0110000");
    expect(w.areas.every((a) => a.code === "0110000" || a.level === "class10")).toBe(true);
    const thunder = w.areas.flatMap((a) => a.warnings).find((x) => x.code === "14")!;
    expect(thunder).toMatchObject({ name: "雷注意報", name_en: "Thunderstorm Advisory", additions: ["竜巻", "ひょう"] });
  });

  it("reports an empty in_effect list when nothing is active", async () => {
    const reports = fixture<RawWarningReport[]>("warning_data_r8_130000.json").map((r) => ({
      ...r,
      warning: {
        class10Items: (r.warning?.class10Items ?? []).map((i) => ({ ...i, kinds: [{ status: "発表警報・注意報はなし" }] })),
        class20Items: [],
      },
    }));
    serveFixtures({ "warning/data/r8/130000.json": reports });
    const w = await getWarnings("東京");
    expect(w.in_effect).toEqual([]);
    expect(w.headlines).toEqual([]);
  });
});

describe("WARNING_CODES", () => {
  it("labels the new urgent-warning tier with its alert level", () => {
    expect(WARNING_CODES["43"]).toEqual({
      ja: "レベル４大雨危険警報",
      en: "Level 4 Heavy Rain Urgent Warning",
      severity: "urgent_warning",
      alert_level: 4,
    });
    expect(WARNING_CODES["33"].severity).toBe("emergency_warning");
  });
});
