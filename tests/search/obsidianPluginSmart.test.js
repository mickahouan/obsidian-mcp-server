import { jest } from "@jest/globals";

const modPath = "../../dist/src/search/providers/obsidianPluginSmart.js";

beforeEach(() => {
  process.env.OBSIDIAN_BASE_URL = "http://x";
  process.env.OBSIDIAN_API_KEY = "k";
});

afterEach(() => {
  delete process.env.OBSIDIAN_BASE_URL;
  delete process.env.OBSIDIAN_API_KEY;
  const gf = global.fetch;
  if (gf && typeof gf === "function" && typeof gf.mockReset === "function") {
    gf.mockReset();
  }
  // @ts-ignore
  delete global.fetch;
});

test("success", async () => {
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({
      results: [{ path: "A.md", score: 0.9, preview: "foo" }],
    }),
  }));
  const { obsidianPluginSmart } = await import(modPath);
  const res = await obsidianPluginSmart({ query: "q" });
  expect(res).toEqual({
    results: [{ path: "A.md", score: 0.9, preview: "foo" }],
  });
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test.each([401, 403, 404])("%s returns null", async (status) => {
  global.fetch = jest.fn(async () => ({ status }));
  const { obsidianPluginSmart } = await import(modPath);
  const res = await obsidianPluginSmart({ query: "q" });
  expect(res).toBeNull();
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test("5xx retries then fails", async () => {
  global.fetch = jest.fn(async () => ({ status: 500 }));
  const { obsidianPluginSmart } = await import(modPath);
  await expect(obsidianPluginSmart({ query: "q" })).rejects.toThrow();
  expect(global.fetch).toHaveBeenCalledTimes(3);
});

test("timeout triggers abort", async () => {
  jest.useFakeTimers();
  global.fetch = jest.fn(
    (url, opts) =>
      new Promise((_resolve, reject) => {
        opts.signal.addEventListener("abort", () => {
          const err = new Error("aborted");
          // @ts-ignore
          err.name = "AbortError";
          reject(err);
        });
      }),
  );
  const { obsidianPluginSmart } = await import(modPath);
  const p = obsidianPluginSmart({ query: "q" });
  jest.advanceTimersByTime(15000);
  await Promise.resolve();
  jest.advanceTimersByTime(15000);
  await Promise.resolve();
  jest.advanceTimersByTime(15000);
  await expect(p).rejects.toThrow();
  expect(global.fetch).toHaveBeenCalledTimes(3);
  jest.useRealTimers();
});
