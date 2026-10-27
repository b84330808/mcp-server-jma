import { findAreas, resolveForOffice } from "../src/areas";
import { serveFixtures } from "./helpers";

jest.mock("axios");

beforeEach(() => {
  serveFixtures();
});

async function top(query: string) {
  const [first] = await findAreas(query, 5);
  return first;
}

describe("findAreas", () => {
  it.each([
    ["東京", "130000"],
    ["東京都", "130000"],
    ["Tokyo", "130000"],
    ["tokyo", "130000"],
    ["Tōkyō", "130000"],
    ["とうきょう", "130000"],
    ["大阪", "270000"],
    ["Osaka", "270000"],
  ])("resolves prefecture %s to office %s", async (query, code) => {
    const m = await top(query);
    expect(m.code).toBe(code);
    expect(m.level).toBe("office");
    expect(m.office_code).toBe(code);
  });

  it.each([
    ["札幌", "0110000"],
    ["札幌市", "0110000"],
    ["さっぽろ", "0110000"],
    ["サッポロ", "0110000"],
    ["Sapporo", "0110000"],
    ["Sapporo City", "0110000"],
    ["渋谷区", "1311300"],
    ["Shibuya", "1311300"],
    ["しぶや", "1311300"],
  ])("resolves municipality %s to %s", async (query, code) => {
    const m = await top(query);
    expect(m.code).toBe(code);
    expect(m.level).toBe("class20");
  });

  it("maps a municipality to the office that forecasts it", async () => {
    const m = await top("札幌");
    expect(m.office_code).toBe("016000");
    expect(m.office_name).toBe("石狩・空知・後志地方");
    expect(m.path).toContain("札幌市");
    expect(m.path.startsWith("北海道地方")).toBe(true);
  });

  it("returns every 府中 so the caller can disambiguate", async () => {
    const matches = await findAreas("府中", 5);
    const codes = matches.map((m) => m.code);
    expect(codes).toEqual(expect.arrayContaining(["1320600", "3420800"]));
  });

  it("prefers the most specific name inside an address", async () => {
    const m = await top("東京都渋谷区");
    expect(m.code).toBe("1311300");
  });

  it("accepts a JMA code directly", async () => {
    const [m] = await findAreas("130010");
    expect(m).toMatchObject({ code: "130010", level: "class10", name: "東京地方", office_code: "130000" });
  });

  it("returns nothing for gibberish", async () => {
    expect(await findAreas("zzqxv")).toEqual([]);
    expect(await findAreas("   ")).toEqual([]);
  });
});

describe("resolveForOffice", () => {
  it("lists the forecast offices when a regional center is too broad", async () => {
    await expect(resolveForOffice("北海道")).rejects.toMatchObject({
      payload: {
        code: "AREA_TOO_BROAD",
        candidates: expect.arrayContaining([expect.objectContaining({ code: "016000", name: "石狩・空知・後志地方" })]),
      },
    });
  });

  it("reports AREA_NOT_FOUND for unknown places", async () => {
    await expect(resolveForOffice("Atlantis")).rejects.toMatchObject({ payload: { code: "AREA_NOT_FOUND" } });
  });

  it("offers other candidates for ambiguous names", async () => {
    const r = await resolveForOffice("府中市");
    expect(r.office_code).toBe("130000");
    expect(r.other_candidates.map((c) => c.code)).toContain("3420800");
  });
});
