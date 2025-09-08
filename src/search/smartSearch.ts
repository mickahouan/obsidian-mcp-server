import type { ObsidianRestApiService, VaultCacheService } from "../services/obsidianRestAPI/index.js";
import { rankDocumentsTFIDF } from "../services/search/tfidfFallback.js";
import { neighborsFromSmartEnv, NeighborResult } from "./providers/smartEnvFiles.js";
import { logger, requestContextService } from "../utils/index.js";
import { config } from "../config/index.js";

export interface SmartSearchInput {
  query?: string;
  fromPath?: string;
  limit?: number;
}

export interface SmartSearchResponse {
  method: "plugin" | "files" | "lexical";
  results: NeighborResult[];
}

export async function smartSearch(
  { query, fromPath, limit = 10 }: SmartSearchInput,
  obsidian: ObsidianRestApiService,
  vault: VaultCacheService,
): Promise<SmartSearchResponse> {
  const ctx = requestContextService.createRequestContext({
    operation: "SmartSearch",
    query,
    fromPath,
  });

  const mode = config.smartSearchMode as
    | "auto"
    | "plugin"
    | "files"
    | "lexical";

  // 1) plugin
  try {
    if ((mode === "plugin" || mode === "auto") && query) {
      const data = await obsidian.smartSearch(query, limit, ctx);
      if (data.results.length) {
        return {
          method: "plugin",
          results: data.results.map((r) => ({
            path: r.filePath,
            score: r.score,
          })),
        };
      }
    }
  } catch (err) {
    logger.warning("plugin unavailable, using fallback", {
      ...ctx,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 2) files
  try {
    if ((mode === "files" || mode === "auto") && !query && fromPath) {
      const res = await neighborsFromSmartEnv(fromPath, limit);
      if (res.length) {
        return { method: "files", results: res };
      }
    }
  } catch (err) {
    logger.warning("smart-env lookup failed, using lexical fallback", {
      ...ctx,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 3) lexical fallback
  const cacheEntries = Array.from(vault.getCache().entries());
  const docs = cacheEntries.map(([p, entry]) => ({ path: p, text: entry.content }));
  const ranked = rankDocumentsTFIDF(query ?? fromPath ?? "", docs).slice(0, limit);
  return { method: "lexical", results: ranked };
}
