import {
  loadSmartEnvVectorsCached,
  cosineTopKWithNorm,
  NoteVecN,
} from "./providers/smartEnvFiles.js";
import {
  resolveSmartEnvDir,
  toPosix,
  samePathEnd,
} from "../utils/resolveSmartEnvDir.js";

export type SmartSearchInput = {
  query?: string;
  fromPath?: string;
  limit?: number;
};
export type SmartSearchOutput = {
  method: "plugin" | "files" | "lexical";
  results: { path: string; score: number }[];
};

// ---- Optional plugin bridge (currently no official API) ----
async function viaPlugin(
  _input: SmartSearchInput,
): Promise<SmartSearchOutput | null> {
  return null;
}

// ---- OPTIONAL: Query encoders (384-d) ----
function canEncodeQueryLocally(): boolean {
  return process.env.ENABLE_QUERY_EMBEDDING === "true";
}

async function encodeQuery384(q: string): Promise<number[]> {
  const method = (process.env.QUERY_EMBEDDER || "").toLowerCase();
  if (!method) throw new Error("No query embedder configured");
  if (method === "http") {
    const url = process.env.EMBEDDING_HTTP_URL;
    if (!url) throw new Error("EMBEDDING_HTTP_URL not set");
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: q }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const js: any = await res.json();
    const vec = js?.vector ?? js?.embedding ?? js?.vec;
    if (!Array.isArray(vec) || vec.length !== 384)
      throw new Error("Invalid vector length (expect 384)");
    return vec;
  }
  if (method === "xenova") {
    // @ts-ignore -- optional dependency
    const t: any = await import("@xenova/transformers").catch(() => null);
    if (!t) throw new Error("xenova transformers not installed");
    const pipe = await t.pipeline(
      "feature-extraction",
      "TaylorAI/bge-micro-v2",
    );
    const out = await pipe(q, { pooling: "mean", normalize: true });
    const arr = Array.from(out?.data ?? out ?? []) as number[];
    if (!Array.isArray(arr) || arr.length < 384)
      throw new Error("Bad encoder output");
    return arr.slice(0, 384);
  }
  throw new Error(`Unknown QUERY_EMBEDDER: ${method}`);
}

// ---- Lexical fallback (TF-IDF) ----
type Doc = { path: string; text: string };

function tokenize(s: string): string[] {
  return (s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function rankDocumentsTFIDF(
  query: string,
  docs: Doc[],
): { path: string; score: number }[] {
  if (!query?.trim() || !docs?.length) return [];
  const qTokens = Array.from(new Set(tokenize(query)));
  const N = docs.length;
  const tokenized = docs.map((d) => tokenize(d.text));
  const tfMaps = tokenized.map((toks) => {
    const m = new Map<string, number>();
    for (const t of toks) m.set(t, (m.get(t) ?? 0) + 1);
    return m;
  });
  const docSets = tokenized.map((toks) => new Set(toks));
  const df = new Map<string, number>();
  for (const term of qTokens) {
    let c = 0;
    for (const s of docSets) if (s.has(term)) c++;
    df.set(term, c);
  }
  const ranked = docs.map((d, i) => {
    let score = 0;
    for (const term of qTokens) {
      const tf = tfMaps[i].get(term) ?? 0;
      const denom = df.get(term) ?? 0;
      if (denom === 0) continue;
      const idf = Math.log(N / denom);
      score += tf * idf;
    }
    return { path: d.path, score };
  });
  return ranked.filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
}

async function fetchVaultDocs(): Promise<Doc[]> {
  const base = process.env.OBSIDIAN_BASE_URL;
  const key = process.env.OBSIDIAN_API_KEY;
  if (!base || !key) return [];
  try {
    const res = await fetch(joinUrl(base, "/vault"), {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return [];
    const body = await res.json().catch(() => ({}));
    const files: string[] = Array.isArray(body?.files)
      ? body.files.map((f: any) => String(f.path ?? "")).filter(Boolean)
      : [];
    const md = files.filter((p) => /\.md$/i.test(p));
    const out: Doc[] = [];
    for (const p of md.slice(0, 500)) {
      const enc = encodeURIComponent(p);
      try {
        const r = await fetch(joinUrl(base, `/vault/${enc}`), {
          headers: { Authorization: `Bearer ${key}` },
        });
        if (!r.ok) continue;
        const text = await r.text();
        out.push({ path: toPosix(p), text });
      } catch {
        /* ignore */
      }
    }
    return out;
  } catch {
    return [];
  }
}

function joinUrl(base: string, p: string) {
  return `${base.replace(/\/+$/, "")}${p}`;
}

function findAnchor(pool: NoteVecN[], fromPath: string): NoteVecN | null {
  const target = toPosix(fromPath);
  const found = pool.find((v) => samePathEnd(v.path, target));
  return found ?? null;
}

export async function smartSearch(
  input: SmartSearchInput,
): Promise<SmartSearchOutput> {
  const query = (input.query ?? "").trim();
  const fromPath = input.fromPath?.trim();
  const limit = Math.max(1, Math.min(100, input.limit ?? 10));
  const wantQuery = !!query;
  const wantNeighbors = !!fromPath;

  // 1) Plugin (noop)
  try {
    if (
      process.env.SMART_SEARCH_MODE === "plugin" &&
      process.env.SMART_CONNECTIONS_API
    ) {
      const via = await viaPlugin({
        query,
        fromPath: fromPath || undefined,
        limit,
      });
      if (via?.results?.length)
        return { method: "plugin", results: via.results };
    }
  } catch {
    // swallow
  }

  // 2) Files (.smart-env)
  try {
    const envRoot = resolveSmartEnvDir();
    if (envRoot) {
      const vecs = await loadSmartEnvVectorsCached();
      if (vecs.length) {
        if (wantNeighbors) {
          const anchor = findAnchor(vecs, fromPath!);
          if (anchor) {
            const pool = vecs.filter((v) => v !== anchor);
            const results = cosineTopKWithNorm(
              anchor.vec,
              anchor.norm,
              pool,
              limit,
            );
            return { method: "files", results };
          }
        }
        if (wantQuery && canEncodeQueryLocally()) {
          const qVec = await encodeQuery384(query);
          const qNorm = Math.hypot(...qVec) || 1;
          const results = cosineTopKWithNorm(qVec, qNorm, vecs, limit);
          return { method: "files", results };
        }
      }
    }
  } catch {
    // swallow
  }

  // 3) Lexical TF-IDF
  if (wantQuery) {
    const docs = await fetchVaultDocs();
    const results = rankDocumentsTFIDF(query, docs).slice(0, limit);
    return { method: "lexical", results };
  }

  return { method: "lexical", results: [] };
}
