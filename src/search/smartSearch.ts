import {
  loadSmartEnvVectors,
  cosineTopK,
  NoteVec,
} from "./providers/smartEnvFiles";
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

// ---- passerelle plugin optionnelle (aucune API officielle pour l’instant) ----
async function viaPlugin(
  _input: SmartSearchInput,
): Promise<SmartSearchOutput | null> {
  return null;
}

// ---- encodage local de requête (xenova) ----
let _pipePromise: Promise<any> | null = null;

function canEncodeQueryLocally(): boolean {
  return (
    process.env.ENABLE_QUERY_EMBEDDING === "true" &&
    (process.env.QUERY_EMBEDDER ?? "xenova").toLowerCase() === "xenova"
  );
}

async function getXenovaPipe() {
  if (_pipePromise) return _pipePromise;
  _pipePromise = (async () => {
    const t: any = await import("@xenova/transformers");
    const pipe = await t.pipeline(
      "feature-extraction",
      "TaylorAI/bge-micro-v2",
    );
    return pipe;
  })();
  return _pipePromise;
}

async function encodeQuery384(q: string): Promise<number[]> {
  const pipe = await getXenovaPipe();
  const out = await pipe(q, { pooling: "mean", normalize: true });
  const vec = Array.from(out?.data ?? out ?? []) as number[];
  if (!Array.isArray(vec) || vec.length < 384)
    throw new Error("Bad encoder output");
  return vec.slice(0, 384);
}

// ---- fallback lexical (TF‑IDF) ----
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
  if (!base || !key || typeof fetch !== "function") return [];
  try {
    const fetchFn: typeof fetch = fetch;
    const res = await fetchFn(joinUrl(base, "/vault"), {
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
        const r = await fetchFn(joinUrl(base, `/vault/${enc}`), {
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

export async function smartSearch(
  input: SmartSearchInput,
): Promise<SmartSearchOutput> {
  const query = (input.query ?? "").trim();
  const fromPath = input.fromPath?.trim();
  const limit = Math.max(1, Math.min(100, input.limit ?? 10));
  const wantQuery = !!query;
  const wantNeighbors = !!fromPath;

  // 1) mode plugin (noop)
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
    // on avale l’erreur
  }

  // 2) fichiers (.smart-env)
  try {
    const envRoot = resolveSmartEnvDir();
    if (envRoot) {
      const vecs = await loadSmartEnvVectors();
      if (vecs.length) {
        if (wantNeighbors) {
          const target = toPosix(fromPath!);
          const anchorEntry =
            vecs.find((v) => samePathEnd(v.path, target)) ??
            vecs.find((v) => v.path === target);
          const anchor = anchorEntry?.vec;
          if (anchor) {
            const pool = vecs.filter((v: NoteVec) => v !== anchorEntry);
            const results = cosineTopK(anchor, pool, limit);
            return { method: "files", results };
          }
        }
        if (wantQuery && canEncodeQueryLocally()) {
          const qVec = await encodeQuery384(query);
          const results = cosineTopK(qVec, vecs, limit);
          return { method: "files", results };
        }
      }
    }
  } catch {
    // on avale l’erreur
  }

  // 3) fallback lexical TF‑IDF
  if (wantQuery || wantNeighbors) {
    const docs = await fetchVaultDocs();
    let lexicalQuery = query;
    if (!lexicalQuery && wantNeighbors) {
      lexicalQuery =
        docs.find((d) => samePathEnd(d.path, fromPath!))?.text || fromPath!;
    }
    const results = rankDocumentsTFIDF(lexicalQuery, docs)
      .filter((r) => !samePathEnd(r.path, fromPath || ""))
      .slice(0, limit);
    return { method: "lexical", results };
  }

  return { method: "lexical", results: [] };
}
