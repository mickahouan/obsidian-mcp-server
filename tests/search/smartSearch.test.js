import { jest } from "@jest/globals";

afterEach(() => {
  delete process.env.SMART_SEARCH_MODE;
  delete process.env.OBSIDIAN_BASE_URL;
  delete process.env.OBSIDIAN_API_KEY;
  const gf = global.fetch;
  if (gf && typeof gf === "function" && typeof gf.mockReset === "function") {
    gf.mockReset();
  }
  // @ts-ignore
  delete global.fetch;
});

test("empty input returns lexical empty", async () => {
  const { smartSearch } = await import("../../dist/src/search/smartSearch.js");
  const res = await smartSearch({});
  expect(res).toEqual({ method: "lexical", results: [] });
});

test("fromPath suffix matches and excludes anchor", async () => {
  jest.resetModules();
  jest.unstable_mockModule(
    "../../dist/src/search/providers/smartEnvFiles.js",
    () => ({
      loadSmartEnvVectors: async () => {
        const a = Array(64).fill(0);
        a[0] = 1;
        const b = Array(64).fill(0);
        b[1] = 1;
        return [
          { path: "dir/sub/A.md", vec: a },
          { path: "dir/B.md", vec: b },
        ];
      },
      cosineTopK: (anchor, pool) =>
        pool.map((d) => ({ path: d.path, score: 1 })),
    }),
  );
  const { smartSearch } = await import("../../dist/src/search/smartSearch.js");
  process.env.SMART_ENV_DIR = "/tmp";
  const res = await smartSearch({ fromPath: "A.md", limit: 5 });
  expect(res.method).toBe("files");
  expect(res.results.some((r) => r.path.endsWith("A.md"))).toBe(false);
  expect(res.results[0].path).toBe("dir/B.md");
});

test("lexical fallback never throws", async () => {
  process.env.SMART_SEARCH_MODE = "lexical";
  process.env.OBSIDIAN_BASE_URL = "http://x";
  process.env.OBSIDIAN_API_KEY = "y";
  global.fetch = jest.fn(async (url) => {
    if (url === "http://x/vault") {
      return { ok: true, json: async () => ({ files: [] }) };
    }
    return { ok: false };
  });
  const { smartSearch } = await import("../../dist/src/search/smartSearch.js");
  await expect(smartSearch({ query: "foo" })).resolves.toEqual({
    method: "lexical",
    results: [],
  });
});
