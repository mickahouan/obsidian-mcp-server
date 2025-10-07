import { promises as fs } from "fs";
import path from "path";

export type SmartVec = {
  id: string;
  notePath: string;
  title?: string;
  tags?: string[];
  model?: string;
  vec: number[];
};

const CANDIDATE_SUBDIRECTORIES = ["", "multi", "vectors", "cache"] as const;

const isNumberArray = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "number");

const normaliseIdentifier = (fileName: string) =>
  fileName.replace(/\.(a)?json$/u, "");

const loadDirectory = async (directory: string): Promise<SmartVec[]> => {
  const results: SmartVec[] = [];
  let files: string[] = [];

  try {
    files = (await fs.readdir(directory)).filter(
      (file) => file.endsWith(".json") || file.endsWith(".ajson"),
    );
  } catch {
    return results;
  }

  await Promise.all(
    files.map(async (file) => {
      try {
        const fullPath = path.join(directory, file);
        const raw = await fs.readFile(fullPath, "utf-8");
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const vector =
          parsed.embedding ?? parsed.vector ?? parsed.vec ?? parsed.values;
        const notePath =
          parsed.path ?? parsed.notePath ?? parsed.filePath ?? parsed.uri;

        if (typeof notePath === "string" && isNumberArray(vector)) {
          results.push({
            id:
              typeof parsed.id === "string" && parsed.id.length > 0
                ? parsed.id
                : normaliseIdentifier(file),
            notePath,
            title: typeof parsed.title === "string" ? parsed.title : undefined,
            tags: Array.isArray(parsed.tags)
              ? (parsed.tags as unknown[]).filter(
                  (entry): entry is string => typeof entry === "string",
                )
              : undefined,
            model: typeof parsed.model === "string" ? parsed.model : undefined,
            vec: vector,
          });
        }
      } catch {
        // Ignore malformed files – best effort loading.
      }
    }),
  );

  return results;
};

export const loadSmartEnv = async (baseDirectory: string): Promise<SmartVec[]> => {
  const vectors: SmartVec[] = [];

  for (const subdirectory of CANDIDATE_SUBDIRECTORIES) {
    const directory = subdirectory
      ? path.join(baseDirectory, subdirectory)
      : baseDirectory;
    const entries = await loadDirectory(directory);
    vectors.push(...entries);
  }

  if (!vectors.length) {
    throw new Error(`No embeddings found in ${baseDirectory}`);
  }

  return vectors;
};

export class SmartEnvCache {
  private cache: SmartVec[] | null = null;

  private expiresAt = 0;

  constructor(private readonly directory: string, private readonly ttlMs: number) {}

  public clear(): void {
    this.cache = null;
    this.expiresAt = 0;
  }

  public async getVectors(): Promise<SmartVec[]> {
    if (!this.directory) {
      throw new Error("SMART_ENV_DIR is not configured");
    }

    const now = Date.now();

    if (
      !this.cache ||
      this.ttlMs <= 0 ||
      now >= this.expiresAt ||
      !this.cache.length
    ) {
      this.cache = await loadSmartEnv(this.directory);
      this.expiresAt = now + Math.max(this.ttlMs, 0);
    }

    return this.cache;
  }
}

export const cosine = (a: number[], b: number[]): number => {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < length; index += 1) {
    const valueA = a[index];
    const valueB = b[index];
    dot += valueA * valueB;
    normA += valueA * valueA;
    normB += valueB * valueB;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dot / denominator;
};

