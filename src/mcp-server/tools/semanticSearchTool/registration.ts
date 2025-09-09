/**
 * @fileoverview Registers the 'smart_search' tool with the MCP server.
 *
 * This is a placeholder implementation that exposes the new semantic search
 * registration API. The actual search logic lives in the corresponding
 * module but may evolve independently.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ObsidianRestApiService } from "../../../services/obsidianRestAPI/index.js";
import type { VaultCacheService } from "../../../services/obsidianRestAPI/vaultCache/index.js";
import { z } from "zod";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import {
  ErrorHandler,
  logger,
  RequestContext,
  requestContextService,
} from "../../../utils/index.js";

const SmartSearchInputSchema = z.object({
  query: z.string().describe("Natural language query to search for"),
});

type SmartSearchInput = z.infer<typeof SmartSearchInputSchema>;

/**
 * Registers the semantic search tool with the given server instance.
 *
 * @param {McpServer} server - The MCP server to register the tool with.
 * @param {ObsidianRestApiService} obsidianService - Service for interacting with Obsidian.
 * @param {VaultCacheService | undefined} vaultCacheService - Optional vault cache service.
 * @returns {Promise<void>} Resolves once registration is complete.
 */
export const registerSemanticSearchTool = async (
  server: McpServer,
  obsidianService: ObsidianRestApiService,
  vaultCacheService: VaultCacheService | undefined,
): Promise<void> => {
  const toolName = "smart_search";
  const toolDescription =
    "Searches the Obsidian vault using semantic embeddings (placeholder implementation).";

  const registrationContext: RequestContext =
    requestContextService.createRequestContext({
      operation: "RegisterSemanticSearchTool",
      toolName,
      module: "SemanticSearchRegistration",
    });

  logger.info(`Attempting to register tool: ${toolName}`, registrationContext);

  await ErrorHandler.tryCatch(
    async () => {
      server.tool(
        toolName,
        toolDescription,
        SmartSearchInputSchema.shape,
        async (params: SmartSearchInput) => {
          const handlerContext: RequestContext =
            requestContextService.createRequestContext({
              parentContext: registrationContext,
              operation: "HandleSemanticSearchRequest",
              toolName,
              params,
            });
          logger.debug(`Handling '${toolName}' request`, handlerContext);

          // TODO: replace placeholder with real semantic search logic
          void obsidianService;
          void vaultCacheService;

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    query: params.query,
                    results: [],
                    note: "Semantic search not implemented yet",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: false,
          };
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
      errorMapper: (error: unknown) =>
        new McpError(
          error instanceof McpError ? error.code : BaseErrorCode.INTERNAL_ERROR,
          `Failed to register tool '${toolName}': ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
          { ...registrationContext },
        ),
      critical: true,
    },
  );
};
