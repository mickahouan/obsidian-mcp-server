import { jest } from "@jest/globals";

afterEach(() => {
  delete process.env.SMART_SEARCH_MODE;
  delete process.env.SMART_CONNECTIONS_API;
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
  const { smartSearch } = await import("../../dist/search/smartSearch.js");
  const res = await smartSearch({});
  expect(res.method).toBe("lexical");
  expect(res.results).toEqual([]);
  expect(res.encoder).toBe("tfidf");
  expect(res.dim).toBe(0);
  expect(res.poolSize).toBe(0);
  expect(typeof res.tookMs).toBe("number");
});

test("fromPath suffix matches and excludes anchor", async () => {
  jest.resetModules();
  jest.unstable_mockModule(
    "../../dist/search/providers/smartEnvFiles.js",
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
      cosineTopK: (_anchor, pool) =>
        pool.map((d) => ({ path: d.path, score: 1 })),
    }),
  );
  const { smartSearch } = await import("../../dist/search/smartSearch.js");
  process.env.SMART_ENV_DIR = "/tmp";
  const res = await smartSearch({ fromPath: "A.md", limit: 5 });
  expect(res.method).toBe("files");
  expect(res.results.some((r) => r.path.endsWith("A.md"))).toBe(false);
  expect(res.results[0].path).toBe("dir/B.md");
  expect(res.encoder).toBe(".smart-env");
  expect(res.poolSize).toBe(1);
  expect(typeof res.tookMs).toBe("number");
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
  const { smartSearch } = await import("../../dist/search/smartSearch.js");
  const out = await smartSearch({ query: "foo" });
  expect(out.method).toBe("lexical");
  expect(out.results).toEqual([]);
  expect(out.encoder).toBe("tfidf");
  expect(out.poolSize).toBe(0);
  expect(typeof out.tookMs).toBe("number");
});

test("plugin success returns plugin results", async () => {
  process.env.SMART_SEARCH_MODE = "plugin";
  process.env.SMART_CONNECTIONS_API = "1";
  process.env.OBSIDIAN_BASE_URL = "http://x";
  process.env.OBSIDIAN_API_KEY = "y";
  global.fetch = jest.fn(async (url) => {
    if (url === "http://x/search/smart") {
      return {
        ok: true,
        json: async () => ({ results: [{ path: "Note.md", score: 0.5 }] }),
      };
    }
    return { ok: true, json: async () => ({ files: [] }) };
  });
  const { smartSearch } = await import("../../dist/search/smartSearch.js");
  const res = await smartSearch({ query: "hello" });
  expect(res.method).toBe("plugin");
  expect(res.results).toEqual([{ path: "Note.md", score: 0.5 }]);
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test.each([401, 403, 404])(
  "plugin %s triggers lexical fallback",
  async (status) => {
    process.env.SMART_SEARCH_MODE = "plugin";
    process.env.SMART_CONNECTIONS_API = "1";
    process.env.OBSIDIAN_BASE_URL = "http://x";
    process.env.OBSIDIAN_API_KEY = "y";
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ status })
      .mockResolvedValue({ ok: true, json: async () => ({ files: [] }) });
    const { smartSearch } = await import("../../dist/search/smartSearch.js");
    const res = await smartSearch({ query: "hello" });
    expect(res.method).toBe("lexical");
    expect(global.fetch).toHaveBeenCalledTimes(2);
  },
);

test("plugin 5xx retries then falls back", async () => {
  process.env.SMART_SEARCH_MODE = "plugin";
  process.env.SMART_CONNECTIONS_API = "1";
  process.env.OBSIDIAN_BASE_URL = "http://x";
  process.env.OBSIDIAN_API_KEY = "y";
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce({ status: 500 })
    .mockResolvedValueOnce({ status: 502 })
    .mockResolvedValueOnce({ status: 503 })
    .mockResolvedValue({ ok: true, json: async () => ({ files: [] }) });
  const { smartSearch } = await import("../../dist/search/smartSearch.js");
  const res = await smartSearch({ query: "hello" });
  expect(res.method).toBe("lexical");
  expect(global.fetch).toHaveBeenCalledTimes(4);
});

test("plugin timeout falls back to lexical", async () => {
  jest.useFakeTimers();
  process.env.SMART_SEARCH_MODE = "plugin";
  process.env.SMART_CONNECTIONS_API = "1";
  process.env.OBSIDIAN_BASE_URL = "http://x";
  process.env.OBSIDIAN_API_KEY = "y";
  let call = 0;
  global.fetch = jest.fn((url, opts) => {
    if (url === "http://x/search/smart") {
      call++;
      return new Promise((_resolve, reject) => {
        opts.signal.addEventListener("abort", () => {
          const err = new Error("aborted");
          // @ts-ignore
          err.name = "AbortError";
          reject(err);
        });
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({ files: [] }) });
  });
  const { smartSearch } = await import("../../dist/search/smartSearch.js");
  const p = smartSearch({ query: "hello" });
  jest.advanceTimersByTime(15000);
  await Promise.resolve();
  jest.advanceTimersByTime(15000);
  await Promise.resolve();
  jest.advanceTimersByTime(15000);
  const res = await p;
  expect(res.method).toBe("lexical");
  expect(global.fetch).toHaveBeenCalledTimes(4);
  jest.useRealTimers();
});
