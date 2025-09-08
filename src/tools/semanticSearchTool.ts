import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ObsidianRestApiService } from "../services/obsidianRestAPI/index.js";
import type { VaultCacheService } from "../services/obsidianRestAPI/vaultCache/index.js";
import { rankDocumentsTFIDF } from "../services/search/tfidfFallback.js";
import {
  ErrorHandler,
  logger,
  RequestContext,
  requestContextService,
} from "../utils/index.js";
import { BaseErrorCode, McpError } from "../types-global/errors.js";
import { config } from "../config/index.js";

const SmartSearchInputSchema = z
  .object({
    query: z.string().min(1).describe("Search query string."),
    limit: z
      .number()
      .int()
      .positive()
      .max(50)
      .optional()
      .default(5)
      .describe("Number of top results to return."),
  })
  .describe(
    "Performs semantic search using embeddings if available, otherwise TF-IDF fallback.",
  );

export const SmartSearchInputSchemaShape = SmartSearchInputSchema.shape;
export type SmartSearchInput = z.infer<typeof SmartSearchInputSchema>;

interface SmartSearchResult {
  path: string;
  score: number;
}

interface SmartSearchResponse {
  method: "semantic" | "lexical";
  results: SmartSearchResult[];
}

export async function registerSemanticSearchTool(
  server: McpServer,
  obsidianService: ObsidianRestApiService,
  vaultCacheService: VaultCacheService,
): Promise<void> {
  const toolName = "smart-search";
  const toolDescription =
    "Semantically searches notes; falls back to lexical TF-IDF if embeddings unavailable.";

  const registrationContext: RequestContext =
    requestContextService.createRequestContext({
      operation: "RegisterSmartSearchTool",
      toolName,
      module: "SemanticSearchToolRegistration",
    });

  logger.info(`Attempting to register tool: ${toolName}`, registrationContext);

  await ErrorHandler.tryCatch(
    async () => {
      server.tool(
        toolName,
        toolDescription,
        SmartSearchInputSchemaShape,
        async (
          params: SmartSearchInput,
          handlerInvocationContext: any,
        ): Promise<any> => {
          const handlerContext: RequestContext =
            requestContextService.createRequestContext({
              operation: "HandleSmartSearchRequest",
              toolName,
              query: params.query,
            });
          logger.debug(`Handling '${toolName}' request`, handlerContext);

          return await ErrorHandler.tryCatch(
            async () => {
              const mode = config.smartSearchMode as
                | "auto"
                | "plugin"
                | "local";
              const usePlugin = mode === "plugin" || mode === "auto";
              const useLocal = mode === "local" || mode === "auto";

              let method: "semantic" | "lexical" = "lexical";
              let results: SmartSearchResult[] = [];

              if (usePlugin) {
                try {
                  const data = await obsidianService.smartSearch(
                    params.query,
                    params.limit,
                    handlerContext,
                  );
                  if (data.results.length > 0) {
                    method = "semantic";
                    results = data.results.map((r) => ({
                      path: r.filePath,
                      score: r.score,
                    }));
                  }
                } catch (err) {
                  logger.warning(
                    "smart-search plugin failed, attempting fallback",
                    {
                      ...handlerContext,
                      error: err instanceof Error ? err.message : String(err),
                    },
                  );
                }
              }

              if (results.length === 0 && useLocal) {
                const cacheEntries = Array.from(
                  vaultCacheService.getCache().entries(),
                );
                const docs = cacheEntries.map(([path, entry]) => ({
                  path,
                  text: entry.content,
                }));
                results = rankDocumentsTFIDF(params.query, docs).slice(
                  0,
                  params.limit,
                );
                method = "lexical";
              }

              if (results.length === 0) {
                throw new McpError(
                  BaseErrorCode.INTERNAL_ERROR,
                  "smart-search: no results",
                  handlerContext,
                );
              }

              logger.debug(
                `'${toolName}' processed successfully`,
                handlerContext,
              );

              const response: SmartSearchResponse = {
                method,
                results,
              };

              return {
                content: [
                  {
                    type: "application/json",
                    json: response,
                  },
                ],
                isError: false,
              };
            },
            {
              operation: `executing tool ${toolName}`,
              context: handlerContext,
              errorCode: BaseErrorCode.INTERNAL_ERROR,
            },
          );
        },
      );

      logger.info(
        `Tool registered successfully: ${toolName}`,
        registrationContext,
      );
    },
    {
      operation: `registering tool ${toolName}`,
      context: registrationContext,
      errorCode: BaseErrorCode.INTERNAL_ERROR,
      critical: true,
    },
  );
}
