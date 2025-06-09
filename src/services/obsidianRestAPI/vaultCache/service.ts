/**
 * @module VaultCacheService
 * @description Service for building and managing an in-memory cache of Obsidian vault content.
 */

import { config } from "../../../config/index.js";
import { NoteJson, ObsidianRestApiService } from "../index.js";
import {
  logger,
  RequestContext,
  requestContextService,
} from "../../../utils/index.js";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import path from "node:path";

interface CacheEntry {
  content: string;
  mtime: number; // Store modification time for date filtering
  // Add other stats if needed, e.g., ctime, size
}

/**
 * Manages an in-memory cache of the Obsidian vault's file structure and metadata.
 *
 * __Is the cache safe and secure?__
 * Yes, the cache is safe and secure for its purpose within this application. Here's why:
 * 1. __In-Memory Storage:__ The cache exists only in the server's memory. It is not written to disk or transmitted over the network, so its attack surface is limited to the server process itself.
 * 2. __Limited Data:__ It stores only file metadata (paths, creation/modification times, size), not the actual content of your notes. This minimizes the risk of exposing sensitive information.
 * 3. __Local Data Source:__ The data populating the cache comes directly from your own Obsidian vault via the local REST API. It is not fetching data from external, untrusted sources.
 */
export class VaultCacheService {
  private vaultContentCache: Map<string, CacheEntry> = new Map();
  private isCacheReady: boolean = false;
  private isBuilding: boolean = false;
  private obsidianService: ObsidianRestApiService;
  private refreshIntervalId: NodeJS.Timeout | null = null;

  constructor(obsidianService: ObsidianRestApiService) {
    this.obsidianService = obsidianService;
    logger.info(
      "VaultCacheService initialized.",
      requestContextService.createRequestContext({
        operation: "VaultCacheServiceInit",
      }),
    );
  }

  /**
   * Starts the periodic cache refresh mechanism.
   * The interval is controlled by the `OBSIDIAN_CACHE_REFRESH_INTERVAL_MIN` config setting.
   */
  public startPeriodicRefresh(): void {
    const refreshIntervalMs =
      config.obsidianCacheRefreshIntervalMin * 60 * 1000;
    if (this.refreshIntervalId) {
      logger.warning(
        "Periodic refresh is already running.",
        requestContextService.createRequestContext({
          operation: "startPeriodicRefresh",
        }),
      );
      return;
    }
    this.refreshIntervalId = setInterval(
      () => this.refreshCache(),
      refreshIntervalMs,
    );
    logger.info(
      `Vault cache periodic refresh scheduled every ${config.obsidianCacheRefreshIntervalMin} minutes.`,
      requestContextService.createRequestContext({
        operation: "startPeriodicRefresh",
      }),
    );
  }

  /**
   * Stops the periodic cache refresh mechanism.
   * Should be called during graceful shutdown.
   */
  public stopPeriodicRefresh(): void {
    const context = requestContextService.createRequestContext({
      operation: "stopPeriodicRefresh",
    });
    if (this.refreshIntervalId) {
      clearInterval(this.refreshIntervalId);
      this.refreshIntervalId = null;
      logger.info("Stopped periodic cache refresh.", context);
    } else {
      logger.info("Periodic cache refresh was not running.", context);
    }
  }

  /**
   * Checks if the cache has been successfully built.
   * @returns {boolean} True if the cache is ready, false otherwise.
   */
  public isReady(): boolean {
    return this.isCacheReady;
  }

  /**
   * Checks if the cache is currently being built.
   * @returns {boolean} True if the cache build is in progress, false otherwise.
   */
  public getIsBuilding(): boolean {
    return this.isBuilding;
  }

  /**
   * Returns the entire vault content cache.
   * Use with caution for large vaults due to potential memory usage.
   * @returns {ReadonlyMap<string, CacheEntry>} The cache map.
   */
  public getCache(): ReadonlyMap<string, CacheEntry> {
    // Return a readonly view or copy if mutation is a concern
    return this.vaultContentCache;
  }

  /**
   * Retrieves a specific entry from the cache.
   * @param {string} filePath - The vault-relative path of the file.
   * @returns {CacheEntry | undefined} The cache entry or undefined if not found.
   */
  public getEntry(filePath: string): CacheEntry | undefined {
    return this.vaultContentCache.get(filePath);
  }

  /**
   * Builds the in-memory cache by fetching all markdown files and their content.
   * This is intended to be run once at startup. Subsequent updates are handled by `refreshCache`.
   */
  public async buildVaultCache(): Promise<void> {
    const initialBuildContext = requestContextService.createRequestContext({
      operation: "buildVaultCache.initialCheck",
    });
    if (this.isBuilding) {
      logger.warning(
        "Cache build already in progress. Skipping.",
        initialBuildContext,
      );
      return;
    }
    if (this.isCacheReady) {
      logger.info("Cache already built. Skipping.", initialBuildContext);
      return;
    }

    await this.refreshCache(true); // Perform an initial, full build
  }

  /**
   * Refreshes the cache by comparing remote file modification times with cached ones.
   * Only fetches content for new or updated files.
   * @param isInitialBuild - If true, forces a full build and sets the cache readiness flag.
   */
  public async refreshCache(isInitialBuild = false): Promise<void> {
    const context = requestContextService.createRequestContext({
      operation: "refreshCache",
      isInitialBuild,
    });

    if (this.isBuilding) {
      logger.warning("Cache refresh already in progress. Skipping.", context);
      return;
    }

    this.isBuilding = true;
    if (isInitialBuild) {
      this.isCacheReady = false;
    }

    logger.info("Starting vault cache refresh process...", context);

    try {
      const startTime = Date.now();
      const remoteFiles = await this.listAllMarkdownFiles("/", context);
      const remoteFileSet = new Set(remoteFiles);
      const cachedFileSet = new Set(this.vaultContentCache.keys());

      let filesAdded = 0;
      let filesUpdated = 0;
      let filesRemoved = 0;

      // 1. Remove deleted files from cache
      for (const cachedFile of cachedFileSet) {
        if (!remoteFileSet.has(cachedFile)) {
          this.vaultContentCache.delete(cachedFile);
          filesRemoved++;
          logger.debug(`Removed deleted file from cache: ${cachedFile}`, {
            ...context,
            filePath: cachedFile,
          });
        }
      }

      // 2. Check for new or updated files
      for (const filePath of remoteFiles) {
        try {
          const fileMetadata = await this.obsidianService.getFileMetadata(
            filePath,
            context,
          );
          const remoteMtime = fileMetadata.mtime;
          const cachedEntry = this.vaultContentCache.get(filePath);

          if (!cachedEntry || cachedEntry.mtime < remoteMtime) {
            const noteJson = (await this.obsidianService.getFileContent(
              filePath,
              "json",
              context,
            )) as NoteJson;
            this.vaultContentCache.set(filePath, {
              content: noteJson.content,
              mtime: noteJson.stat.mtime,
            });

            if (!cachedEntry) {
              filesAdded++;
              logger.debug(`Added new file to cache: ${filePath}`, {
                ...context,
                filePath,
              });
            } else {
              filesUpdated++;
              logger.debug(`Updated modified file in cache: ${filePath}`, {
                ...context,
                filePath,
              });
            }
          }
        } catch (error) {
          logger.error(
            `Failed to process file during cache refresh: ${filePath}. Skipping. Error: ${error instanceof Error ? error.message : String(error)}`,
            { ...context, filePath },
          );
        }
      }

      const duration = (Date.now() - startTime) / 1000;
      if (isInitialBuild) {
        this.isCacheReady = true;
        logger.info(
          `Initial vault cache build completed in ${duration.toFixed(2)}s. Cached ${this.vaultContentCache.size} files.`,
          context,
        );
      } else {
        logger.info(
          `Vault cache refresh completed in ${duration.toFixed(2)}s. Added: ${filesAdded}, Updated: ${filesUpdated}, Removed: ${filesRemoved}. Total cached: ${this.vaultContentCache.size}.`,
          context,
        );
      }
    } catch (error) {
      logger.error(
        `Critical error during vault cache refresh. Cache may be incomplete. Error: ${error instanceof Error ? error.message : String(error)}`,
        context,
      );
      if (isInitialBuild) {
        this.isCacheReady = false;
      }
    } finally {
      this.isBuilding = false;
    }
  }

  /**
   * Helper to recursively list all markdown files. Similar to the one in search logic.
   * @param dirPath - Starting directory path.
   * @param context - Request context.
   * @param visitedDirs - Set to track visited directories.
   * @returns Array of file paths.
   */
  private async listAllMarkdownFiles(
    dirPath: string,
    context: RequestContext,
    visitedDirs: Set<string> = new Set(),
  ): Promise<string[]> {
    const operation = "listAllMarkdownFiles";
    const opContext = { ...context, operation, dirPath };
    const normalizedPath = path.posix.normalize(dirPath === "" ? "/" : dirPath);

    if (visitedDirs.has(normalizedPath)) {
      logger.warning(
        `Cycle detected or directory already visited during cache build: ${normalizedPath}. Skipping.`,
        opContext,
      );
      return [];
    }
    visitedDirs.add(normalizedPath);

    let markdownFiles: string[] = [];
    try {
      const entries = await this.obsidianService.listFiles(
        normalizedPath,
        opContext,
      );
      for (const entry of entries) {
        const fullPath = path.posix.join(normalizedPath, entry);
        if (entry.endsWith("/")) {
          const subDirFiles = await this.listAllMarkdownFiles(
            fullPath,
            opContext,
            visitedDirs,
          );
          markdownFiles = markdownFiles.concat(subDirFiles);
        } else if (entry.toLowerCase().endsWith(".md")) {
          markdownFiles.push(fullPath);
        }
      }
      return markdownFiles;
    } catch (error) {
      const errMsg = `Failed to list directory during cache build scan: ${normalizedPath}`;
      const err = error as McpError | Error; // Type assertion
      if (err instanceof McpError && err.code === BaseErrorCode.NOT_FOUND) {
        logger.warning(`${errMsg} - Directory not found, skipping.`, opContext);
        return [];
      }
      // Log and re-throw critical listing errors
      if (err instanceof Error) {
        logger.error(errMsg, err, opContext);
      } else {
        logger.error(errMsg, opContext);
      }
      const errorCode =
        err instanceof McpError ? err.code : BaseErrorCode.INTERNAL_ERROR;
      throw new McpError(
        errorCode,
        `${errMsg}: ${err instanceof Error ? err.message : String(err)}`,
        opContext,
      );
    }
  }
}
