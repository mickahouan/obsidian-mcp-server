import { loadSmartEnvVectors, cosineTopK, NoteVec } from "./providers/smartEnvFiles.js";
import { resolveSmartEnvDir, toPosix, samePathEnd } from "../utils/resolveSmartEnvDir.js";
import { pluginSmartSearch } from "./providers/obsidianPluginSmart.js";

export type SmartSearchInput = {
  query?: string;
  fromPath?: string;
  limit?: number;
};
export type SmartSearchOutput = {
  method: "plugin" | "files" | "lexical";
  results: { path: string; score: number; preview?: string }[];
  encoder: string;
  dim: number;
  poolSize: number;
  tookMs: number;
};

async function lexicalRestSearch(
  query: string,
  limit: number,
): Promise<SmartSearchOutput> {
  const start = Date.now();
  const base = process.env.OBSIDIAN_BASE_URL;
  const key = process.env.OBSIDIAN_API_KEY;
  if (!base || !key || typeof fetch !== "function" || !query.trim()) {
    return {
      method: "lexical",
      results: [],
      encoder: "none",
      dim: 0,
      poolSize: 0,
      tookMs: Date.now() - start,
    };
  }
  try {
    const url =
      `${base.replace(/\/+$/, "")}/search/simple/?query=${encodeURIComponent(
        query,
      )}&contextLength=0`;
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
    });
    const tookMs = Date.now() - start;
    if (!res.ok) {
      return {
        method: "lexical",
        results: [],
        encoder: "none",
        dim: 0,
        poolSize: 0,
        tookMs,
      };
    }
    const body = await res.json().catch(() => []);
    const results = Array.isArray(body)
      ? body
          .slice(0, limit)
          .map((r: any) => ({
            path: toPosix(typeof r?.filename === "string" ? r.filename : ""),
            score: typeof r?.score === "number" ? r.score : 0,
          }))
          .filter((r) => r.path)
      : [];
    return {
      method: "lexical",
      results,
      encoder: "none",
      dim: 0,
      poolSize: 0,
      tookMs,
    };
  } catch {
    return {
      method: "lexical",
      results: [],
      encoder: "none",
      dim: 0,
      poolSize: 0,
      tookMs: Date.now() - start,
    };
  }
}

export async function smartSearch(
  input: SmartSearchInput,
): Promise<SmartSearchOutput> {
  const startAll = Date.now();
  const query = input.query?.trim() || "";
  const fromPath = input.fromPath?.trim();
  const limit = Math.max(1, Math.min(50, Math.floor(input.limit ?? 10)));
  const mode = (process.env.SMART_SEARCH_MODE ?? "auto").toLowerCase();

  if (fromPath) {
    try {
      const envRoot = resolveSmartEnvDir();
      if (envRoot) {
        const vecs = await loadSmartEnvVectors();
        if (vecs.length) {
          const target = toPosix(fromPath).split("#")[0];
          const anchorEntry =
            vecs.find((v) => samePathEnd(v.path, target)) ||
            vecs.find((v) => v.path === target);
          const anchor = anchorEntry?.vec;
          if (anchor) {
            const pool = vecs.filter((v: NoteVec) => v !== anchorEntry);
            const t = Date.now();
            const results = cosineTopK(anchor, pool, limit);
            return {
              method: "files",
              results,
              encoder: ".smart-env",
              dim: anchor.length,
              poolSize: pool.length,
              tookMs: Date.now() - t,
            };
          }
        }
      }
    } catch {
      /* ignore */
    }
    return {
      method: "files",
      results: [],
      encoder: ".smart-env",
      dim: 0,
      poolSize: 0,
      tookMs: Date.now() - startAll,
    };
  }

  if (query) {
    if (mode === "plugin" || mode === "auto") {
      try {
        const t = Date.now();
        const via = await pluginSmartSearch(query, limit);
        if (via?.results?.length) {
          return {
            method: "plugin",
            results: via.results,
            encoder: "none",
            dim: 0,
            poolSize: 0,
            tookMs: Date.now() - t,
          };
        }
      } catch {
        /* ignore */
      }
    }
    return await lexicalRestSearch(query, limit);
  }

  return {
    method: "lexical",
    results: [],
    encoder: "none",
    dim: 0,
    poolSize: 0,
    tookMs: Date.now() - startAll,
  };
}
