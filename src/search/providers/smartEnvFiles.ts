import fs from "node:fs";
import path from "node:path";
import { resolveSmartEnvDir, toPosix } from "../../utils/resolveSmartEnvDir.js";

export type NoteVec = { path: string; vec: number[] };

// --- Walker FS minimal ---
function listFilesRecursive(
  root: string,
  accept: (p: string) => boolean,
): string[] {
  const out: string[] = [];
  if (!fs.existsSync(root)) return out;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let ents: fs.Dirent[] = [];
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of ents) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile() && accept(full)) out.push(full);
    }
  }
  return out;
}

// --- Heuristique nom de fichier -> note ---
function guessNotePathFromFilename(filePath: string): string | null {
  const base = path.basename(filePath);
  if (/_md\.ajson$/i.test(base)) return base.replace(/_md\.ajson$/i, ".md");
  if (/\.md\.ajson$/i.test(base)) return base.replace(/\.md\.ajson$/i, ".md");
  if (/\.ajson$/i.test(base)) return base.replace(/\.ajson$/i, "");
  return null;
}

function isNumArray(a: any, minDim = 64): a is number[] {
  return Array.isArray(a) && a.length >= minDim && typeof a[0] === "number";
}

// --- Extraction tolérante (chemin + embedding) ---
function extractFromObject(
  j: any,
  fallbackFile: string,
): { vec: number[] | null; notePath: string | null } {
  let vec: number[] | null = null;
  let notePath: string | null = null;

  // candidats chemin
  const pathCandidates = [
    j?.source?.path,
    j?.note?.path,
    j?.meta?.path,
    j?.path,
    j?.filePath,
    j?.relativePath,
    j?.SmartSource?.path,
  ].filter(Boolean);
  for (const p of pathCandidates) {
    if (typeof p === "string" && /\.md$/i.test(p)) {
      notePath = toPosix(p);
      break;
    }
  }
  if (!notePath) notePath = guessNotePathFromFilename(fallbackFile);

  // embeddings déclaratifs
  const embRoot =
    j?.embeddings ?? j?.data?.embeddings ?? j?.SmartSource?.embeddings;
  if (embRoot && typeof embRoot === "object") {
    for (const rec of Object.values(embRoot)) {
      if (!rec || typeof rec !== "object") continue;
      for (const [k, v] of Object.entries(rec)) {
        const key = k.toLowerCase();
        if (key === "vec" || key === "vector" || key === "embedding") {
          if (isNumArray(v)) {
            vec = v;
            break;
          }
        }
      }
      if (vec) break;
    }
  }
  if (vec && notePath) return { vec, notePath };

  // fallback : scan profond vec/vector/embedding + ...path
  const seen = new Set<any>();
  const q: any[] = [j];
  while (q.length) {
    const cur = q.shift();
    if (!cur || typeof cur !== "object" || seen.has(cur)) continue;
    seen.add(cur);
    for (const [k, v] of Object.entries(cur)) {
      if (typeof v === "object") q.push(v as any);
      if (!vec && ["vec", "vector", "embedding"].includes(k.toLowerCase())) {
        if (isNumArray(v)) vec = v as number[];
      }
      if (
        !notePath &&
        k.toLowerCase().includes("path") &&
        typeof v === "string" &&
        v.toLowerCase().endsWith(".md")
      ) {
        notePath = toPosix(v);
      }
      if (vec && notePath) break;
    }
    if (vec && notePath) break;
  }

  if (!notePath) notePath = guessNotePathFromFilename(fallbackFile);
  return { vec, notePath };
}

// --- Cache TTL ---
type CacheShape = {
  expiresAt: number;
  items: NoteVec[];
  dir: string;
  dim: number;
};
let CACHE: CacheShape | null = null;

function ttlMs(): number {
  const v = Number(process.env.SMART_ENV_CACHE_TTL_MS ?? "60000");
  return isFinite(v) && v > 0 ? Math.floor(v) : 60000;
}
function maxItems(): number {
  const v = Number(process.env.SMART_ENV_CACHE_MAX ?? "0");
  return isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

export async function loadSmartEnvVectors(): Promise<NoteVec[]> {
  const now = Date.now();
  if (CACHE && CACHE.expiresAt > now) {
    console.error(
      `[smart-env] loaded vectors: ${CACHE.items.length}, dim: ${CACHE.dim}, dir: ${CACHE.dir}`,
    );
    return CACHE.items;
  }

  const root = resolveSmartEnvDir();
  if (!root) {
    console.error(`[smart-env] loaded vectors: 0, dim: 0, dir: -`);
    return [];
  }

  let dir = root;
  if (
    !/multi$/i.test(path.basename(root)) &&
    fs.existsSync(path.join(root, "multi"))
  ) {
    dir = path.join(root, "multi");
  }

  const files = listFilesRecursive(dir, (p) => /\.ajson$/i.test(p));
  const out: NoteVec[] = [];

  for (const f of files) {
    try {
      const raw = fs.readFileSync(f, "utf8");
      const j = JSON.parse(raw.trim());
      const { vec, notePath } = extractFromObject(j, f);
      if (vec && notePath) out.push({ path: notePath, vec });
    } catch {
      /* ignore */
    }
  }

  const limited = maxItems() > 0 ? out.slice(0, maxItems()) : out;
  const dim = limited[0]?.vec.length ?? 0;
  CACHE = { expiresAt: now + ttlMs(), items: limited, dir, dim };
  console.error(
    `[smart-env] loaded vectors: ${limited.length}, dim: ${dim}, dir: ${dir}`,
  );
  return limited;
}

export function cosineTopK(anchor: number[], pool: NoteVec[], k: number) {
  const aN = Math.hypot(...anchor) || 1;
  return pool
    .map((d) => {
      const n = Math.min(anchor.length, d.vec.length);
      let dot = 0;
      for (let i = 0; i < n; i++) dot += anchor[i] * d.vec[i];
      const bN = Math.hypot(...d.vec) || 1;
      return { path: d.path, score: dot / (aN * bN) };
    })
    .sort((x, y) => y.score - x.score)
    .slice(0, Math.max(1, Math.min(100, k)));
}
