import { getForecast } from "../src/forecast";
import { serveFixtures } from "./helpers";

jest.mock("axios");

beforeEach(() => {
  serveFixtures();
});

describe("getForecast", () => {
  it("returns the 3-day forecast for every sub-region of an office", async () => {
    const f = await getForecast("東京");
    expect(f.office).toEqual({ code: "130000", name: "東京都" });
    expect(f.report_datetime).toBe("2026-10-27T11:00:00+09:00");
    expect(f.short_term.areas.map((a) => a.code)).toEqual(["130010", "130020", "130030", "130040"]);

    const tokyo = f.short_term.areas[0];
    expect(tokyo.days).toHaveLength(3);
    expect(tokyo.days[0]).toEqual({
      date: "2026-10-27",
      weather: "くもり 時々 晴れ 所により 昼前 雨",
      weather_code: "201",
      weather_en: expect.any(String),
      wind: "北の風 23区西部 では 後 北の風 やや強く",
      wave: "0.5メートル 後 1メートル",
    });
    expect(tokyo.precipitation_chance[0]).toEqual({
      from: "2026-10-27T12:00:00+09:00",
      to: "2026-10-27T18:00:00+09:00",
      percent: 10,
    });
    // The last block's end is computed: start + 6 h.
    expect(tokyo.precipitation_chance[5].to).toBe("2026-10-29T00:00:00+09:00");
  });

  it("drops today's low once the morning has passed and pairs lows with highs", async () => {
    const f = await getForecast("東京");
    const station = f.short_term.temperatures.find((t) => t.station === "東京")!;
    expect(station.days).toEqual([
      { date: "2026-10-27", min_c: null, max_c: 22 },
      { date: "2026-10-28", min_c: 15, max_c: 20 },
    ]);
  });

  it("parses the weekly outlook with ranges, reliability and normals", async () => {
    const f = await getForecast("Tokyo");
    expect(f.weekly).not.toBeNull();
    const area = f.weekly!.areas.find((a) => a.code === "130010")!;
    expect(area.days).toHaveLength(7);
    expect(area.days[0].precipitation_chance_percent).toBeNull();
    expect(area.days[2]).toMatchObject({ weather_code: "202", precipitation_chance_percent: 50, reliability: "C" });
    expect(area.days[2].weather).toBe("曇一時雨");

    const t = f.weekly!.temperatures.find((s) => s.station === "東京")!;
    expect(t.days[1]).toEqual({ date: "2026-10-29", min_c: 12, min_c_range: [10, 13], max_c: 16, max_c_range: [14, 20] });

    const normal = f.weekly!.normals.find((n) => n.station === "東京")!;
    expect(normal).toEqual({ station_code: "44132", station: "東京", temp_min_c: 11.7, temp_max_c: 19.6, precip_7day_total_mm: { min: 7, max: 29.7 } });
  });

  it("narrows to the sub-region of a municipality", async () => {
    const f = await getForecast("渋谷区");
    expect(f.resolved).toMatchObject({ code: "1311300", level: "class20" });
    expect(f.short_term.areas.map((a) => a.code)).toEqual(["130010"]);
    expect(f.short_term.temperatures.map((t) => t.station_code)).toEqual(["44132"]);
    expect(f.weekly!.areas.map((a) => a.code)).toEqual(["130010"]);
  });

  it("includes the forecaster's overview", async () => {
    const f = await getForecast("130000");
    expect(f.overview?.text).toContain("東京地方は、曇りで");
    expect(f.source_url).toBe("https://www.jma.go.jp/bosai/forecast/#area_type=offices&area_code=130000");
  });

  it("still answers when the overview is missing", async () => {
    serveFixtures({ "forecast/data/overview_forecast/130000.json": undefined });
    const f = await getForecast("東京");
    expect(f.overview).toBeNull();
    expect(f.short_term.areas.length).toBeGreaterThan(0);
  });
});
