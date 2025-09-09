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
  // TODO: Wire up semantic search tool registration logic
  void server; // temporary no-op to satisfy eslint for unused vars
  void obsidianService;
  void vaultCacheService;
};
