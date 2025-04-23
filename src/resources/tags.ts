/**
 * Tag resource implementation
 */
import { Resource, TextContent } from "@modelcontextprotocol/sdk/types.js";
import pLimit from 'p-limit'; // Import p-limit
import { sep } from "path";
import { ObsidianClient } from "../obsidian/client.js";
import { JsonLogicQuery } from "../obsidian/types.js";
import { PropertyManager } from "../tools/properties/manager.js";
import { createLogger, ErrorCategoryType } from "../utils/logging.js";
import { TagResponse } from "./types.js";

// Create a logger for tag resources
const logger = createLogger('TagResource');

/**
 * Helper function to safely convert any error to an object
 */
function errorToObject(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      errorCategory: ErrorCategoryType.CATEGORY_SYSTEM
    };
  } else if (typeof error === 'object' && error !== null) {
    return error as Record<string, unknown>;
  } else {
    return { 
      error: String(error),
      errorCategory: ErrorCategoryType.CATEGORY_UNKNOWN
    };
  }
}

/**
 * Resource for providing tags used in the Obsidian vault
 */
export class TagResource {
  private tagCache: Map<string, Set<string>> = new Map();
  private propertyManager: PropertyManager;
  private isInitialized = false;
  private isUpdating = false; // Flag to prevent concurrent updates
  private lastUpdate = 0;
  private updateInterval = 5000; // 5 seconds

  constructor(private client: ObsidianClient) {
    this.propertyManager = new PropertyManager(client);
    this.initializeCache();
  }

  /**
   * Get resource description for the MCP server
   */
  getResourceDescription(): Resource {
    return {
      uri: "obsidian://tags",
      name: "Obsidian Tags",
      description: "List of all tags used across the Obsidian vault with their usage counts",
      mimeType: "application/json"
    };
  }

  /**
   * Initialize the tag cache
   */
  private async initializeCache() {
    logger.startTimer('init_tag_cache');
    
    try {
      logger.info('Initializing tag cache');
      
      // Get all markdown files using platform-agnostic path pattern
      const query: JsonLogicQuery = {
        "glob": [`**${sep}*.md`.replace(/\\/g, '/'), { "var": "path" }]
      };
      
      const results = await this.client.searchJson(query);
      this.tagCache.clear();

      // Create a limiter with a concurrency of 3 (reduced from 10)
      const limit = pLimit(3); 

      // Create promises for processing each file with concurrency limiting
      const processingPromises = results
        .filter(result => 'filename' in result) // Ensure filename exists
        .map((result) => limit(async () => { // Wrap the async function with the limiter
          const filename = result.filename;
          try {
            // This call is now rate-limited
            const content = await this.client.getFileContents(filename);
            // Only extract tags from frontmatter YAML
            const parseResult = this.propertyManager.parseProperties(content);
            // Handle potential parsing errors before accessing properties
            if (parseResult.error) {
              logger.warn(`Skipping tags for ${filename} due to parsing error: ${parseResult.error.message}`);
              return { filename, tags: [] }; // Return empty tags on error
            }
            return { filename, tags: parseResult.properties.tags || [] };
          } catch (error) {
            logger.error(`Failed to process file ${filename}:`, errorToObject(error));
            return { filename, error: true }; // Mark as failed
          }
        })); // Close the limiter wrapper

      // Execute promises in parallel and wait for all to settle
      const processedResults = await Promise.allSettled(processingPromises);

      // Populate the cache from settled results
      processedResults.forEach(settledResult => {
        // Check if the promise was fulfilled and didn't encounter a processing error
        if (settledResult.status === 'fulfilled' && !settledResult.value.error) {
          const { filename, tags } = settledResult.value;
          // Ensure tags is an array before iterating
          if (tags && Array.isArray(tags)) {
            tags.forEach((tag: string) => {
              this.addTag(tag, filename);
            });
          }
        } else if (settledResult.status === 'rejected') {
          // Log unexpected rejections from the async map function itself
          logger.error(`Unexpected error during file processing setup:`, errorToObject(settledResult.reason));
        } 
        // Errors during getFileContents/parseProperties are already logged within the map function
      });

      this.isInitialized = true;
      this.lastUpdate = Date.now();
      
      const elapsedMs = logger.endTimer('init_tag_cache');
      logger.logOperationResult(true, 'initialize_tag_cache', elapsedMs, {
        tagCount: this.tagCache.size,
        fileCount: results.length
      });
      
      logger.info(`Tag cache initialized with ${this.tagCache.size} unique tags`);
    } catch (error) {
      const elapsedMs = logger.endTimer('init_tag_cache');
      logger.logOperationResult(false, 'initialize_tag_cache', elapsedMs);
      logger.error("Failed to initialize tag cache:", errorToObject(error));
      throw error;
    }
  }

  /**
   * Add a tag to the cache
   */
  private addTag(tag: string, filepath: string) {
    if (!this.tagCache.has(tag)) {
      this.tagCache.set(tag, new Set());
    }
    this.tagCache.get(tag)!.add(filepath);
  }

  /**
   * Update the cache if needed, preventing race conditions.
   */
  private async updateCacheIfNeeded() {
    const now = Date.now();
    // Check if cache is fresh enough
    if (now - this.lastUpdate <= this.updateInterval) {
      return; // Cache is up-to-date
    }

    // Check if an update is already in progress
    if (this.isUpdating) {
      logger.debug('Cache update already in progress, skipping redundant update.');
      // Optionally, wait for the ongoing update instead of returning immediately
      // For now, we return to avoid complexity, potentially serving slightly stale data.
      return; 
    }

    // Acquire the update lock
    this.isUpdating = true;
    logger.debug('Acquired cache update lock.');

    try {
      // Double-check the update condition after acquiring the lock
      // to handle cases where another process finished updating
      // while this one was waiting for the lock (though less likely with a simple flag).
      const nowAfterLock = Date.now();
      if (nowAfterLock - this.lastUpdate > this.updateInterval) {
        logger.info('Tag cache needs update, refreshing...');
        await this.initializeCache(); // This method updates this.lastUpdate internally
      } else {
        logger.debug('Cache was updated by another process while waiting for lock.');
      }
    } catch (error) {
      // Log error during update, but don't necessarily block other operations
      logger.error('Error during cache update:', errorToObject(error));
      // Decide if the error should be re-thrown or handled gracefully
      // For now, we log and continue, allowing the lock to be released.
    } finally {
      // Release the update lock
      this.isUpdating = false;
      logger.debug('Released cache update lock.');
    }
  }

  /**
   * Get the content for the resource, optionally filtering by path.
   * Note: The path filtering logic assumes the tool handler passes the path correctly.
   */
  // TODO: Verify how the path argument is passed from the tool handler
  async getContent(filterPath?: string): Promise<TextContent[]> { 
    logger.startTimer('get_tags_content');
    
    try {
      if (!this.isInitialized) {
        logger.info('Tag cache not initialized, initializing now');
        await this.initializeCache();
      } else {
        await this.updateCacheIfNeeded();
      }

      let filteredTagEntries: { name: string; files: Set<string> }[] = [];

      // Filter tags based on the provided path
      if (filterPath) {
        // Normalize path to ensure it ends with a separator for accurate startsWith check
        const normalizedFilterPath = filterPath.endsWith(sep) ? filterPath : filterPath + sep;
        logger.debug(`Filtering tags for path: ${normalizedFilterPath}`);
        
        filteredTagEntries = Array.from(this.tagCache.entries())
          .map(([name, files]) => {
            // Filter files within each tag entry
            const relevantFiles = Array.from(files).filter(file => file.startsWith(normalizedFilterPath));
            return { name, files: new Set(relevantFiles) };
          })
          .filter(tagEntry => tagEntry.files.size > 0); // Keep only tags that exist in the filtered path
          
        logger.debug(`Found ${filteredTagEntries.length} tags after filtering.`);
      } else {
        // If no path provided, use all tags from the cache
        filteredTagEntries = Array.from(this.tagCache.entries()).map(([name, files]) => ({ name, files }));
      }

      const response: TagResponse = {
        tags: filteredTagEntries
          .map(({ name, files }) => ({ // Map from the potentially filtered structure
            name,
            count: files.size,
            files: Array.from(files).sort()
          }))
          .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)), // Sort filtered results
        metadata: {
          // Note: Metadata currently reflects the entire vault cache, even when filtered.
          // Adjust calculation here if path-specific metadata is desired.
          totalOccurrences: Array.from(this.tagCache.values()) 
            .reduce((sum, files) => sum + files.size, 0),
          uniqueTags: this.tagCache.size,
          scannedFiles: new Set(
            Array.from(this.tagCache.values())
              .flatMap(files => Array.from(files))
          ).size,
          lastUpdate: this.lastUpdate
        }
      };

      logger.debug(`Returning tag resource with ${response.tags.length} tags`);
      
      const elapsedMs = logger.endTimer('get_tags_content');
      logger.logOperationResult(true, 'get_tags', elapsedMs, {
        tagCount: response.tags.length,
        totalOccurrences: response.metadata.totalOccurrences,
        uniqueTags: response.metadata.uniqueTags,
        scannedFiles: response.metadata.scannedFiles
      });
      
      return [{
        type: "text",
        text: JSON.stringify(response, null, 2),
        uri: this.getResourceDescription().uri
      }];
    } catch (error) {
      const elapsedMs = logger.endTimer('get_tags_content');
      logger.logOperationResult(false, 'get_tags', elapsedMs);
      logger.error("Failed to get tags:", errorToObject(error));
      throw error;
    }
  }
}
