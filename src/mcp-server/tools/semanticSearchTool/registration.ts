/**
 * Semantic search (Smart Connections) — Implémentation réelle
 * - Lit les embeddings dans `.smart-env`
 * - Encode la requête avec BGE-small (384d) via @xenova/transformers
 * - Classement cosinus, filtres dossier/tag, snippets optionnels
 * - Expose `smart_semantic_search` + alias `smart_search` et `smart-search`
 * Schéma JSON "Codex-friendly" (pas d'integer ni d'unions).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { promises as fs } from "fs";
import { loadSmartEnv, cosine, type SmartVec } from "../../../services/smartEnv.js";
import { resolveNoteAbsolutePath } from "./resolvePath.js";
import type { ObsidianRestApiService } from "../../../services/obsidianRestAPI/index.js";
import type { VaultCacheService } from "../../../services/obsidianRestAPI/vaultCache/index.js";

const In = z.object({
  query: z.string().min(2, "query too short"),
  top_k: z.number().min(1).max(100).default(20),
  folders: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  with_snippets: z.boolean().default(true),
});

const Out = z.object({
  model: z.string().optional(),
  dim: z.number().optional(),
  results: z.array(
    z.object({
      path: z.string(),
      score: z.number(),
      title: z.string().optional(),
      snippet: z.string().optional(),
    }),
  ),
});

type InType = z.infer<typeof In>;
type OutType = z.infer<typeof Out>;

type SmartEnvCacheEntry = {
  dir: string;
  ts: number;
  items: SmartVec[];
};

let smartEnvCache: SmartEnvCacheEntry | null = null;

function getEnv() {
  const env = process.env;
  const SMART_ENV_DIR = env.SMART_ENV_DIR;
  const ENABLE_QUERY_EMBEDDING =
    (env.ENABLE_QUERY_EMBEDDING ?? "true").toLowerCase() === "true";
  const QUERY_EMBEDDER_MODEL_HINT = env.QUERY_EMBEDDER_MODEL_HINT;
  const OBSIDIAN_VAULT =
    env.OBSIDIAN_VAULT ??
    SMART_ENV_DIR?.replace(/[/\\]\.smart-env.*/u, "") ??
    "";
  const CACHE_TTL = Number.isFinite(Number(env.SMART_ENV_CACHE_TTL_MS))
    ? Number(env.SMART_ENV_CACHE_TTL_MS)
    : 60000;

  return {
    SMART_ENV_DIR,
    ENABLE_QUERY_EMBEDDING,
    QUERY_EMBEDDER_MODEL_HINT,
    OBSIDIAN_VAULT,
    CACHE_TTL,
  };
}

async function loadItemsWithCache(
  dir: string,
  ttlMs: number,
): Promise<SmartVec[]> {
  const ttl = Number.isFinite(ttlMs) ? Math.max(ttlMs, 0) : 60000;
  const now = Date.now();

  if (
    !smartEnvCache ||
    smartEnvCache.dir !== dir ||
    now - smartEnvCache.ts > ttl
  ) {
    const items = await loadSmartEnv(dir);
    smartEnvCache = { dir, ts: now, items };
  }

  return smartEnvCache.items;
}

function makeSuccessResult(payload: OutType) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
    isError: false,
  };
}

function makeErrorResult(error: unknown) {
  const message =
    error instanceof Error ? error.message : String(error ?? "Unknown error");

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ error: message }, null, 2),
      },
    ],
    isError: true,
  };
}

async function performSearch(input: InType): Promise<OutType> {
  const {
    SMART_ENV_DIR,
    ENABLE_QUERY_EMBEDDING,
    QUERY_EMBEDDER_MODEL_HINT,
    OBSIDIAN_VAULT,
    CACHE_TTL,
  } = getEnv();

  if (!SMART_ENV_DIR) {
    throw new Error("SMART_ENV_DIR is not set");
  }

  if (!ENABLE_QUERY_EMBEDDING) {
    throw new Error("ENABLE_QUERY_EMBEDDING=false");
  }

  const query = input.query.trim();
  if (!query) {
    return { model: undefined, dim: undefined, results: [] };
  }

  const items = await loadItemsWithCache(SMART_ENV_DIR, CACHE_TTL);
  if (!items.length) {
    throw new Error(`No embeddings found in ${SMART_ENV_DIR}`);
  }

  const dimension = items[0]?.vec?.length ?? 0;
  if (!dimension) {
    throw new Error("Embeddings are missing vector data");
  }

  const model = items[0]?.model;

  const { getEmbedder } = await import("../../../adapters/embed/xenova.js");
  const embed = await getEmbedder(QUERY_EMBEDDER_MODEL_HINT, dimension);
  const queryVector = await embed(query);

  if (queryVector.length !== dimension) {
    throw new Error(
      `Query embedder produced ${queryVector.length} dimensions, expected ${dimension}`,
    );
  }

  const filtered = items.filter((item) => {
    const folderOk =
      !input.folders ||
      input.folders.some((folder) => item.notePath.startsWith(folder));
    const tagsOk =
      !input.tags ||
      (item.tags ?? []).some((tag) => input.tags?.includes(tag));
    return folderOk && tagsOk;
  });

  const ranked = filtered
    .map((item) => ({
      item,
      score: cosine(queryVector, item.vec),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, input.top_k);

  const results: OutType["results"] = [];

  for (const { item, score } of ranked) {
    let snippet: string | undefined;

    if (input.with_snippets) {
      const absolutePath = resolveNoteAbsolutePath(item.notePath, OBSIDIAN_VAULT);
      try {
        const content = await fs.readFile(absolutePath, "utf-8");
        snippet = content.slice(0, 300);
      } catch {
        snippet = undefined;
      }
    }

    results.push({
      path: item.notePath,
      score,
      title: item.title,
      snippet,
    });
  }

  return {
    model,
    dim: dimension,
    results,
  };
}

async function handleSearchRequest(params: unknown): Promise<OutType> {
  const parsed = In.parse(params);
  return performSearch(parsed);
}

export const registerSemanticSearchTool = async (
  server: McpServer,
  _obsidianService: ObsidianRestApiService,
  _vaultCacheService: VaultCacheService | undefined,
): Promise<void> => {
  const register = (name: string, description: string) => {
    server.tool(
      name,
      description,
      In.shape,
      async (params: InType, _extra: unknown) => {
        try {
          const payload = await handleSearchRequest(params);
          Out.parse(payload);
          return makeSuccessResult(payload);
        } catch (error) {
          return makeErrorResult(error);
        }
      },
    );
  };

  register(
    "smart_semantic_search",
    "Semantic search powered by Smart Connections embeddings (BGE-small, 384d).",
  );
  register(
    "smart_search",
    "Alias of smart_semantic_search (same implementation).",
  );
  register(
    "smart-search",
    "Alias of smart_semantic_search (same implementation).",
  );
};

// Exported for local testing (non-public API).
export const __testHandleSmartSearch = handleSearchRequest;
