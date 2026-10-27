import { getTsunamiInfo, tsunamiLevel } from "../src/tsunami";
import { getVolcanoWarnings } from "../src/volcano";
import { serveFixtures } from "./helpers";

jest.mock("axios");

beforeEach(() => {
  serveFixtures();
});

describe("getTsunamiInfo", () => {
  it("returns the latest bulletin per event and marks expired forecasts", async () => {
    const r = await getTsunamiInfo({ now: new Date("2026-10-27T12:00:00+09:00") });
    expect(r.bulletins.map((b) => b.event_id)).toEqual(["20261010025608", "20260930140037"]);
    expect(r.any_in_effect).toBe(false);
    expect(r.any_warning_in_effect).toBe(false);

    const b = r.bulletins[0];
    expect(b).toMatchObject({
      title: "津波予報",
      valid_until: "2026-10-11T20:00:00+09:00",
      in_effect: false,
      highest_level: "forecast",
      earthquake: { epicenter: "中米", epicenter_en: "Central America", magnitude: 8, latitude: 7.5, longitude: -80.8 },
    });
    expect(b.categories[0].category).toBe("津波予報（若干の海面変動）");
    expect(b.categories[0].areas[0]).toMatchObject({ code: "100", name: "北海道太平洋沿岸東部", max_height: "<0.2" });
    expect(b.comment?.en).toContain("no tsunami damage is expected");
  });

  it("treats a forecast as in effect before it expires", async () => {
    const r = await getTsunamiInfo({ limit: 1, now: new Date("2026-10-10T04:00:00+09:00") });
    expect(r.bulletins).toHaveLength(1);
    expect(r.any_in_effect).toBe(true);
    // A forecast (slight sea-level change) is not a warning or advisory.
    expect(r.any_warning_in_effect).toBe(false);
  });

  it("classifies category codes", () => {
    expect(tsunamiLevel("52")).toBe("major_warning");
    expect(tsunamiLevel("51")).toBe("warning");
    expect(tsunamiLevel("62")).toBe("advisory");
    expect(tsunamiLevel("71")).toBe("forecast");
    expect(tsunamiLevel("00")).toBe("none");
  });

  it("copes with an empty feed", async () => {
    serveFixtures({ "tsunami/data/list.json": [] });
    const r = await getTsunamiInfo();
    expect(r).toMatchObject({ bulletins: [], any_in_effect: false, any_warning_in_effect: false });
  });
});

describe("getVolcanoWarnings", () => {
  it("lists volcanoes with alert levels, active warnings first", async () => {
    const r = await getVolcanoWarnings();
    expect(r.volcanoes).toHaveLength(14);
    expect(r.volcanoes[0]).toMatchObject({ name: "桜島", name_en: "Sakurajima", alert_level: 3, change: "引下げ", warning_in_effect: true });
    expect(r.volcanoes[0].municipalities).toEqual([{ warning: "火口周辺警報", names: ["鹿児島県鹿児島市"] }]);
    expect(r.volcanoes[0].latitude).toBeCloseTo(31.59, 1);
  });

  it("marks volcanoes lowered to an eruption forecast as not under warning", async () => {
    const r = await getVolcanoWarnings({ volcano: "口永良部島" });
    expect(r.volcanoes).toHaveLength(1);
    expect(r.volcanoes[0]).toMatchObject({ alert_level: 1, warning_in_effect: false });
  });

  it("filters by romaji name", async () => {
    const r = await getVolcanoWarnings({ volcano: "Tokachidake" });
    expect(r.volcanoes.map((v) => v.name)).toEqual(["十勝岳"]);
  });

  it("names a matching volcano that has no warning", async () => {
    const r = await getVolcanoWarnings({ volcano: "富士山" });
    expect(r.volcanoes).toEqual([]);
    expect(r.query_matches_without_warning).toEqual([expect.objectContaining({ name: "富士山" })]);
  });
});
