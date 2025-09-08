import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ObsidianRestApiService } from "../services/obsidianRestAPI/index.js";
import type { VaultCacheService } from "../services/obsidianRestAPI/vaultCache/index.js";
import { smartSearch } from "../search/index.js";
import {
  ErrorHandler,
  logger,
  RequestContext,
  requestContextService,
} from "../utils/index.js";
import { BaseErrorCode } from "../types-global/errors.js";

const SmartSearchBaseSchema = z.object({
    query: z.string().min(1).optional().describe("Search query string."),
    fromPath: z
      .string()
      .min(1)
      .optional()
      .describe("Return notes similar to this vault-relative path."),
    limit: z
      .number()
      .int()
      .positive()
      .max(50)
      .optional()
      .default(5)
      .describe("Number of top results to return."),
});

const SmartSearchInputSchema = SmartSearchBaseSchema
  .refine((d) => d.query || d.fromPath, {
    message: "Either query or fromPath must be provided",
  })
  .describe(
    "Performs smart search via plugin or smart-env files, with lexical TF-IDF fallback.",
  );

export const SmartSearchInputSchemaShape = SmartSearchBaseSchema.shape;
export type SmartSearchInput = z.infer<typeof SmartSearchInputSchema>;

interface SmartSearchResult {
  path: string;
  score: number;
}

interface SmartSearchResponse {
  method: "plugin" | "files" | "lexical";
  results: SmartSearchResult[];
}

export async function registerSemanticSearchTool(
  server: McpServer,
  obsidianService: ObsidianRestApiService,
  vaultCacheService: VaultCacheService,
): Promise<void> {
  const toolName = "smart-search";
  const toolDescription =
    "Searches notes semantically via plugin or smart-env files with lexical TF-IDF fallback.";

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
              fromPath: params.fromPath,
            });
          logger.debug(`Handling '${toolName}' request`, handlerContext);

          return await ErrorHandler.tryCatch(
            async () => {
              const { method, results } = await smartSearch(
                params,
                obsidianService,
                vaultCacheService,
              );

              if (results.length === 0) {
                logger.debug(
                  "smart-search returned no results",
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
