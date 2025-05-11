/**
 * Main entry point for the MCP (Model Context Protocol) server.
 * This file orchestrates the server's lifecycle:
 * 1. Initializes the core McpServer instance with its identity and capabilities.
 * 2. Registers available resources and tools, making them discoverable and usable by clients.
 * 3. Selects and starts the appropriate communication transport (stdio or Streamable HTTP)
 *    based on configuration.
 * 4. Handles top-level error management during startup.
 *
 * MCP Specification References:
 * - Lifecycle: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-03-26/basic/lifecycle.mdx
 * - Overview (Capabilities): https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-03-26/basic/index.mdx
 * - Transports: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-03-26/basic/transports.mdx
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
// Import validated configuration and environment details.
import { config, environment } from '../config/index.js';
// Import core utilities: ErrorHandler, logger, requestContextService.
import { ErrorHandler, logger, requestContextService } from '../utils/index.js';
// Import the Obsidian service
import { ObsidianRestApiService } from '../services/obsidianRestAPI/index.js';
// Import the Vault Cache service
import { VaultCacheService } from '../services/vaultCache/index.js';
// Import registration functions for specific resources and tools.
import { registerObsidianDeleteFileTool } from './tools/obsidianDeleteFileTool/index.js';
import { registerObsidianGlobalSearchTool } from './tools/obsidianGlobalSearchTool/index.js';
import { registerObsidianListFilesTool } from './tools/obsidianListFilesTool/index.js';
import { registerObsidianReadFileTool } from './tools/obsidianReadFileTool/index.js';
import { registerObsidianSearchReplaceTool } from './tools/obsidianSearchReplaceTool/index.js';
import { registerObsidianUpdateFileTool } from './tools/obsidianUpdateFileTool/index.js';
// Import transport setup functions.
import { startHttpTransport } from './transports/httpTransport.js';
import { connectStdioTransport } from './transports/stdioTransport.js';


/**
 * Creates and configures a new instance of the McpServer.
 *
 * This function is central to defining the server's identity and functionality
 * as presented to connecting clients during the MCP initialization phase.
 * It uses pre-instantiated shared services like Obsidian API and Vault Cache.
 *
 * MCP Spec Relevance:
 * - Server Identity (`serverInfo`): The `name` and `version` provided here are part
 *   of the `ServerInformation` object returned in the `InitializeResult` message.
 * - Capabilities Declaration: Declares supported features like logging, dynamic resources/tools.
 * - Resource/Tool Registration: Calls registration functions, passing necessary service instances.
 *
 * @param {ObsidianRestApiService} obsidianService - The shared Obsidian REST API service instance.
 * @param {VaultCacheService} vaultCacheService - The shared Vault Cache service instance.
 * @returns {Promise<McpServer>} A promise resolving with the configured McpServer instance.
 * @throws {Error} If any resource or tool registration fails.
 */
async function createMcpServerInstance(
  obsidianService: ObsidianRestApiService,
  vaultCacheService: VaultCacheService
): Promise<McpServer> {
  const context = { operation: 'createMcpServerInstance' };
  logger.info('Creating MCP server instance with shared services', context);

  requestContextService.configure({
    appName: config.mcpServerName,
    appVersion: config.mcpServerVersion,
    environment,
  });

  logger.debug('Instantiating McpServer with capabilities', { ...context, serverInfo: { name: config.mcpServerName, version: config.mcpServerVersion }, capabilities: { logging: {}, resources: { listChanged: true }, tools: { listChanged: true } } });
  const server = new McpServer(
    { name: config.mcpServerName, version: config.mcpServerVersion },
    { capabilities: { logging: {}, resources: { listChanged: true }, tools: { listChanged: true } } }
  );

  try {
    logger.debug('Registering resources and tools using shared services...', context);
    await registerObsidianDeleteFileTool(server, obsidianService);
    await registerObsidianGlobalSearchTool(server, obsidianService, vaultCacheService);
    await registerObsidianListFilesTool(server, obsidianService);
    await registerObsidianReadFileTool(server, obsidianService);
    await registerObsidianSearchReplaceTool(server, obsidianService);
    await registerObsidianUpdateFileTool(server, obsidianService);
    logger.info('Resources and tools registered successfully', context);

    logger.info("Triggering background vault cache build (if not already built/building)...", context);
    vaultCacheService.buildVaultCache().catch(cacheBuildError => {
        logger.error("Error occurred during background vault cache build", {
            ...context,
            operation: 'BackgroundCacheBuild',
            error: cacheBuildError instanceof Error ? cacheBuildError.message : String(cacheBuildError),
            stack: cacheBuildError instanceof Error ? cacheBuildError.stack : undefined,
        });
    });

  } catch (err) {
    logger.error('Failed to register resources/tools', {
      ...context,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    throw err;
  }

  return server;
}


/**
 * Selects, sets up, and starts the appropriate MCP transport layer based on configuration.
 * This function acts as the bridge between the core server logic and the communication channel.
 * It now accepts shared service instances to pass them down the chain.
 *
 * @param {ObsidianRestApiService} obsidianService - The shared Obsidian REST API service instance.
 * @param {VaultCacheService} vaultCacheService - The shared Vault Cache service instance.
 * @returns {Promise<McpServer | void>} Resolves with the McpServer instance for 'stdio', or void for 'http'.
 * @throws {Error} If the configured transport type is unsupported or if transport setup fails.
 */
async function startTransport(
  obsidianService: ObsidianRestApiService,
  vaultCacheService: VaultCacheService
): Promise<McpServer | void> {
  const transportType = config.mcpTransportType;
  const context = { operation: 'startTransport', transport: transportType };
  logger.info(`Starting transport: ${transportType}`, context);

  if (transportType === 'http') {
    logger.debug('Delegating to startHttpTransport with a factory for McpServer instances...', context);
    const mcpServerFactory = async () => createMcpServerInstance(obsidianService, vaultCacheService);
    await startHttpTransport(mcpServerFactory, context);
    return;
  }

  if (transportType === 'stdio') {
    logger.debug('Creating single McpServer instance for stdio transport using shared services...', context);
    const server = await createMcpServerInstance(obsidianService, vaultCacheService);
    logger.debug('Delegating to connectStdioTransport...', context);
    await connectStdioTransport(server, context);
    return server;
  }

  logger.fatal(`Unsupported transport type configured: ${transportType}`, context);
  throw new Error(`Unsupported transport type: ${transportType}. Must be 'stdio' or 'http'.`);
}

/**
 * Main application entry point. Initializes services and starts the MCP server.
 *
 * @param {ObsidianRestApiService} obsidianService - The shared Obsidian REST API service instance, instantiated by the caller (e.g., index.ts).
 * @param {VaultCacheService} vaultCacheService - The shared Vault Cache service instance, instantiated by the caller (e.g., index.ts).
 * @returns {Promise<void | McpServer>} Resolves upon successful startup (void for http, McpServer for stdio). Rejects on critical failure.
 */
export async function initializeAndStartServer(
  obsidianService: ObsidianRestApiService,
  vaultCacheService: VaultCacheService
): Promise<void | McpServer> {
  const context = { operation: 'initializeAndStartServer' };
  logger.info('MCP Server initialization sequence started (services provided).', context);

  try {
    // Services are now provided by the caller (e.g., index.ts)
    logger.debug('Using provided shared services (ObsidianRestApiService, VaultCacheService).', context);

    // Initiate the transport setup based on configuration, passing shared services.
    const result = await startTransport(obsidianService, vaultCacheService);
    logger.info('MCP Server initialization sequence completed successfully.', context);
    return result;
  } catch (err) {
    logger.fatal('Critical error during MCP server initialization.', {
      ...context,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    ErrorHandler.handleError(err, { ...context, critical: true });
    logger.info('Exiting process due to critical initialization error.', context);
    process.exit(1);
  }
}
