import { jest } from "@jest/globals";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

afterEach(() => {
  delete process.env.SMART_SEARCH_MODE;
  delete process.env.OBSIDIAN_BASE_URL;
  delete process.env.OBSIDIAN_API_KEY;
  delete process.env.SMART_ENV_DIR;
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
  expect(res.method).toBe("lexical");
  expect(res.results).toEqual([]);
  expect(res.encoder).toBe("none");
  expect(res.dim).toBe(0);
  expect(res.poolSize).toBe(0);
  expect(typeof res.tookMs).toBe("number");
  expect(res.tookMs).toBeLessThan(100);
});

async function setupSmartEnv() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "smart-env-"));
  await fs.mkdir(path.join(dir, "multi"));
  const anchor = Array(64).fill(0);
  anchor[0] = 1;
  const vecB = Array(64).fill(0);
  vecB[1] = 1;
  const vecC = Array(64).fill(0);
  vecC[2] = 1;
  await fs.writeFile(
    path.join(dir, "multi", "Ecole_md.ajson"),
    JSON.stringify({ embeddings: { m: { vec: anchor } }, source: { path: "dir/ÉCOLE.md" } }),
  );
  await fs.writeFile(
    path.join(dir, "multi", "B_md.ajson"),
    JSON.stringify({ embeddings: { m: { vec: vecB } }, source: { path: "dir/B.md" } }),
  );
  await fs.writeFile(
    path.join(dir, "multi", "C_md.ajson"),
    JSON.stringify({ embeddings: { m: { vec: vecC } }, source: { path: "dir/C.md" } }),
  );
  return dir;
}

test("fromPath accent suffix match and sorted", async () => {
  const dir = await setupSmartEnv();
  process.env.SMART_ENV_DIR = dir;
  const { smartSearch } = await import("../../dist/src/search/smartSearch.js");
  const res = await smartSearch({ fromPath: "ecole.md" });
  expect(res.method).toBe("files");
  expect(res.results.map((r) => r.path)).toEqual(["dir/B.md", "dir/C.md"]);
  expect(res.results.every((r, i, arr) => i === 0 || arr[i - 1].score >= r.score)).toBe(
    true,
  );
  expect(res.results.some((r) => /ÉCOLE\.md$/i.test(r.path))).toBe(false);
  expect(res.encoder).toBe(".smart-env");
});

test("fromPath works when SMART_ENV_DIR points to multi", async () => {
  const dir = await setupSmartEnv();
  process.env.SMART_ENV_DIR = path.join(dir, "multi");
  const { smartSearch } = await import("../../dist/src/search/smartSearch.js");
  const res = await smartSearch({ fromPath: "dir/École.md" });
  expect(res.method).toBe("files");
  expect(res.results.length).toBe(2);
});

test("plugin success returns plugin results", async () => {
  process.env.SMART_SEARCH_MODE = "plugin";
  process.env.OBSIDIAN_BASE_URL = "http://x";
  process.env.OBSIDIAN_API_KEY = "y";
  global.fetch = jest.fn(async (url) => {
    if (url.startsWith("http://x/search/smart")) {
      return {
        ok: true,
        json: async () => ({ results: [{ path: "Note.md", score: 0.5, preview: "p" }] }),
      };
    }
    return { ok: true, json: async () => [] };
  });
  const { smartSearch } = await import("../../dist/src/search/smartSearch.js");
  const res = await smartSearch({ query: "hello" });
  expect(res.method).toBe("plugin");
  expect(res.results).toEqual([{ path: "Note.md", score: 0.5, preview: "p" }]);
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test.each([401, 403, 404])("plugin %s triggers lexical fallback", async (status) => {
  process.env.SMART_SEARCH_MODE = "plugin";
  process.env.OBSIDIAN_BASE_URL = "http://x";
  process.env.OBSIDIAN_API_KEY = "y";
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce({ status })
    .mockResolvedValue({ ok: true, json: async () => [] });
  const { smartSearch } = await import("../../dist/src/search/smartSearch.js");
  const res = await smartSearch({ query: "hello" });
  expect(res.method).toBe("lexical");
  expect(global.fetch).toHaveBeenCalledTimes(2);
});

test("plugin 5xx retries then lexical fallback", async () => {
  process.env.SMART_SEARCH_MODE = "plugin";
  process.env.OBSIDIAN_BASE_URL = "http://x";
  process.env.OBSIDIAN_API_KEY = "y";
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce({ status: 500 })
    .mockResolvedValueOnce({ status: 500 })
    .mockResolvedValueOnce({ status: 500 })
    .mockResolvedValue({ ok: true, json: async () => [] });
  const { smartSearch } = await import("../../dist/src/search/smartSearch.js");
  const res = await smartSearch({ query: "hello" });
  expect(res.method).toBe("lexical");
  expect(global.fetch).toHaveBeenCalledTimes(4);
});

test("plugin timeout falls back to lexical", async () => {
  jest.useFakeTimers();
  process.env.SMART_SEARCH_MODE = "plugin";
  process.env.OBSIDIAN_BASE_URL = "http://x";
  process.env.OBSIDIAN_API_KEY = "y";
  let calls = 0;
  global.fetch = jest.fn((url, opts) => {
    if (url.startsWith("http://x/search/smart")) {
      calls++;
      return new Promise((_resolve, reject) => {
        opts.signal.addEventListener("abort", () => {
          const err = new Error("aborted");
          // @ts-ignore
          err.name = "AbortError";
          reject(err);
        });
      });
    }
    return Promise.resolve({ ok: true, json: async () => [] });
  });
  const { smartSearch } = await import("../../dist/src/search/smartSearch.js");
  const p = smartSearch({ query: "hello" });
  jest.advanceTimersByTime(15000);
  await Promise.resolve();
  jest.advanceTimersByTime(15000);
  await Promise.resolve();
  jest.advanceTimersByTime(15000);
  const res = await p;
  expect(res.method).toBe("lexical");
  expect(global.fetch).toHaveBeenCalledTimes(4);
  expect(calls).toBe(3);
  jest.useRealTimers();
});
