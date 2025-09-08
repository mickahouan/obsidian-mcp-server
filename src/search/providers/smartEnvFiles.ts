import path from "node:path";
import { promises as fs } from "node:fs";
import { resolveSmartEnvDir } from "../../utils/resolveSmartEnvDir.js";

export interface NeighborResult {
  path: string;
  score: number;
}

export async function neighborsFromSmartEnv(
  fromPath: string,
  limit = 10,
): Promise<NeighborResult[]> {
  const root = resolveSmartEnvDir();
  if (!root) throw new Error("SMART_ENV_DIR not set");
  try {
    const metaPath = path.join(root, "smart_env.json");
    const meta = JSON.parse(await fs.readFile(metaPath, "utf8"));

    const notes: Record<string, any> = meta.notes || meta.paths || {};

    const reverseMap = new Map<string, string>();
    for (const [p, info] of Object.entries(notes)) {
      const nid =
        typeof info === "string"
          ? info
          : (info.id ?? info.vec ?? info.vectorId ?? info.vector_id);
      if (nid) reverseMap.set(nid, p);
    }

    const info = notes[fromPath];
    const id =
      typeof info === "string"
        ? info
        : (info?.id ?? info?.vec ?? info?.vectorId ?? info?.vector_id);
    if (!id) return [];

    const multiDir = path.join(root, "multi");
    async function find(fileDir: string): Promise<string | null> {
      const entries = await fs.readdir(fileDir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(fileDir, entry.name);
        if (entry.isDirectory()) {
          const res = await find(full);
          if (res) return res;
        } else if (entry.isFile() && entry.name === `${id}.json`) {
          return full;
        }
      }
      return null;
    }

    const neighborFile = await find(multiDir);
    if (!neighborFile) return [];

    const raw = JSON.parse(await fs.readFile(neighborFile, "utf8"));
    let arr: Array<{ id: string; score: number }> = [];
    if (Array.isArray(raw)) {
      arr = raw.map((e: any) =>
        Array.isArray(e)
          ? { id: e[0], score: Number(e[1]) }
          : { id: e.id, score: Number(e.score) },
      );
    } else if (raw && typeof raw === "object") {
      arr = Object.entries(raw).map(([nid, score]) => ({
        id: nid,
        score: Number(score),
      }));
    }

    return arr
      .map((n) => ({ path: reverseMap.get(n.id) ?? "", score: n.score }))
      .filter((n) => n.path)
      .slice(0, limit);
  } catch {
    return [];
  }
}
