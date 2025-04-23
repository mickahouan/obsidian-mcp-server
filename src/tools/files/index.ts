/**
 * File operation tools exports
 */
export * from './content.js';
export * from './list.js';

import { ObsidianClient } from '../../obsidian/client.js';
import {
  AppendContentToolHandler,
  GetFileContentsToolHandler,
  PatchContentToolHandler
} from './content.js';
import {
  ListFilesInDirToolHandler,
  ListFilesInVaultToolHandler
} from './list.js';

/**
 * Create all file-related tool handlers
 * @param client The ObsidianClient instance
 * @returns Array of file tool handlers
 */
export function createFileToolHandlers(client: ObsidianClient) {
  return [
    new ListFilesInVaultToolHandler(client),
    new ListFilesInDirToolHandler(client),
    new GetFileContentsToolHandler(client),
    new AppendContentToolHandler(client),
    new PatchContentToolHandler(client)
  ];
}