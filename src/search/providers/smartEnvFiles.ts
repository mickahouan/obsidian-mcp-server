import fs from "node:fs";
import path from "node:path";
import { resolveSmartEnvDir, toPosix } from "../../utils/resolveSmartEnvDir.js";

export type NoteVec = { path: string; vec: number[] };
export type NoteVecN = { path: string; vec: number[]; norm: number };

function listFilesRecursive(
  root: string,
  accept: (p: string) => boolean,
): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        stack.push(full);
      } else if (e.isFile() && accept(full)) {
        out.push(full);
      }
    }
  }
  return out;
}

function guessNotePathFromFilename(filePath: string): string | null {
  const base = path.basename(filePath);
  if (/_md\.ajson$/i.test(base)) {
    return base.replace(/_md\.ajson$/i, ".md");
  }
  if (/\.ajson$/i.test(base)) {
    return base.replace(/\.ajson$/i, "");
  }
  return null;
}

function tryGetVec(obj: any): number[] | null {
  const emb = obj?.embeddings ?? obj?.data?.embeddings;
  if (!emb || typeof emb !== "object") return null;
  const modelKey = Object.keys(emb)[0];
  const rec = emb[modelKey];
  const arr = rec?.vec;
  if (Array.isArray(arr) && arr.length > 0 && typeof arr[0] === "number") {
    return arr as number[];
  }
  return null;
}

function tryGetNotePath(obj: any, fallbackFromFilename: string): string | null {
  const p =
    obj?.source?.path ??
    obj?.meta?.path ??
    obj?.note?.path ??
    guessNotePathFromFilename(fallbackFromFilename);
  return p ? toPosix(p) : null;
}

export async function loadSmartEnvVectorsRaw(): Promise<NoteVec[]> {
  const root = resolveSmartEnvDir();
  if (!root) return [];
  const multi = path.join(root, "multi");
  const files = listFilesRecursive(multi, (p) => /\.ajson$/i.test(p));
  const out: NoteVec[] = [];
  for (const f of files) {
    try {
      const raw = fs.readFileSync(f, "utf8");
      const j = JSON.parse(raw);
      const vec = tryGetVec(j);
      const notePath = tryGetNotePath(j, f);
      if (vec && notePath) {
        out.push({ path: notePath, vec });
      }
    } catch {
      // ignore malformed file
    }
  }
  return out;
}

// caching
export type CacheShape = { expiresAt: number; vecs: NoteVecN[] };
let CACHE: CacheShape | null = null;

function ttlMs(): number {
  const v = Number(process.env.SMART_ENV_CACHE_TTL_MS ?? "60000");
  return isFinite(v) && v > 0 ? v : 60000;
}

function maxItems(): number {
  const v = Number(process.env.SMART_ENV_CACHE_MAX ?? "0");
  return isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

function withNorm(v: NoteVec): NoteVecN {
  const n = Math.hypot(...v.vec) || 1;
  return { path: v.path, vec: v.vec, norm: n };
}

function maybeLimit<T>(arr: T[]): T[] {
  const m = maxItems();
  return m > 0 && arr.length > m ? arr.slice(0, m) : arr;
}

export async function loadSmartEnvVectorsCached(): Promise<NoteVecN[]> {
  const now = Date.now();
  if (CACHE && CACHE.expiresAt > now) return CACHE.vecs;
  const raw = await loadSmartEnvVectorsRaw();
  const arr = maybeLimit(raw).map(withNorm);
  CACHE = { expiresAt: now + ttlMs(), vecs: arr };
  return arr;
}

export function invalidateSmartEnvCache(): void {
  CACHE = null;
}

export function cosineTopKWithNorm(
  anchorVec: number[],
  anchorNorm: number,
  pool: NoteVecN[],
  k: number,
) {
  const aN = anchorNorm || Math.hypot(...anchorVec) || 1;
  return pool
    .map((d) => {
      const n = Math.min(anchorVec.length, d.vec.length);
      let dot = 0;
      for (let i = 0; i < n; i++) dot += anchorVec[i] * d.vec[i];
      return { path: d.path, score: dot / (aN * d.norm) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
