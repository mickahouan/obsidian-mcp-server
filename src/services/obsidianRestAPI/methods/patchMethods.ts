/**
 * @module PatchMethods
 * @description
 * Methods for performing granular PATCH operations within notes via the Obsidian REST API.
 */

import { AxiosRequestConfig } from 'axios';
import { RequestContext } from '../../../utils/index.js';
import { PatchOptions, Period } from '../types.js';

/**
 * Encodes a vault-relative file path correctly for API URLs.
 * Ensures path separators '/' are not encoded, but individual components are.
 * Handles leading slashes correctly.
 *
 * @param filePath - The raw vault-relative file path (e.g., "/Notes/My File.md" or "Notes/My File.md").
 * @returns The URL-encoded path suitable for appending to `/vault`.
 */
function encodeVaultPath(filePath: string): string {
    // 1. Trim whitespace and remove any leading/trailing slashes for consistent processing.
    const trimmedPath = filePath.trim().replace(/^\/+|\/+$/g, '');

    // 2. If the original path was just '/' or empty, return an empty string (represents root for files).
    if (trimmedPath === '') {
        // For file operations, the API expects /vault/filename.md at the root,
        // so an empty encoded path segment is correct here.
        return '';
    }

    // 3. Split into components, encode each component, then rejoin with literal '/'.
    const encodedComponents = trimmedPath.split('/').map(encodeURIComponent);
    const encodedPath = encodedComponents.join('/');

    // 4. Prepend the leading slash.
    return `/${encodedPath}`;
}

// Define a type for the internal request function signature
type RequestFunction = <T = any>(
  config: AxiosRequestConfig,
  context: RequestContext,
  operationName: string
) => Promise<T>;

/**
 * Helper to construct headers for PATCH requests.
 */
function buildPatchHeaders(options: PatchOptions): Record<string, string> {
  const headers: Record<string, string> = {
    'Operation': options.operation,
    'Target-Type': options.targetType,
    // Spec requires URL encoding for non-ASCII characters in Target header
    'Target': encodeURIComponent(options.target),
  };
  if (options.targetDelimiter) {
    headers['Target-Delimiter'] = options.targetDelimiter;
  }
  if (options.trimTargetWhitespace !== undefined) {
    headers['Trim-Target-Whitespace'] = String(options.trimTargetWhitespace);
  }
  // Add Create-Target-If-Missing header if provided in options
  if (options.createTargetIfMissing !== undefined) {
    headers['Create-Target-If-Missing'] = String(options.createTargetIfMissing);
  }
  if (options.contentType) {
    headers['Content-Type'] = options.contentType;
  } else {
    // Default to markdown if not specified, especially for non-JSON content
    headers['Content-Type'] = 'text/markdown';
  }
  return headers;
}

/**
 * Patches a specific file in the vault.
 * @param _request - The internal request function from the service instance.
 * @param filePath - Vault-relative path to the file.
 * @param content - The content to insert/replace (string or JSON for tables/frontmatter).
 * @param options - Patch operation details (operation, targetType, target, etc.).
 * @param context - Request context.
 * @returns {Promise<void>} Resolves on success (200 OK).
 */
export async function patchFile(
  _request: RequestFunction,
  filePath: string,
  content: string | object, // Allow object for JSON content type
  options: PatchOptions,
  context: RequestContext
): Promise<void> {
  const headers = buildPatchHeaders(options);
  const requestData = typeof content === 'object' ? JSON.stringify(content) : content;
  const encodedPath = encodeVaultPath(filePath); // Use the local helper

  // PATCH returns 200 OK according to spec
  await _request<void>({
    method: 'PATCH',
    url: `/vault${encodedPath}`, // Use the encoded path
    headers: headers,
    data: requestData,
  }, context, 'patchFile');
}

/**
 * Patches the currently active file in Obsidian.
 * @param _request - The internal request function from the service instance.
 * @param content - The content to insert/replace.
 * @param options - Patch operation details.
 * @param context - Request context.
 * @returns {Promise<void>} Resolves on success (200 OK).
 */
export async function patchActiveFile(
  _request: RequestFunction,
  content: string | object,
  options: PatchOptions,
  context: RequestContext
): Promise<void> {
  const headers = buildPatchHeaders(options);
  const requestData = typeof content === 'object' ? JSON.stringify(content) : content;

  await _request<void>({
    method: 'PATCH',
    url: `/active/`,
    headers: headers,
    data: requestData,
  }, context, 'patchActiveFile');
}

/**
 * Patches a periodic note.
 * @param _request - The internal request function from the service instance.
 * @param period - The period type ('daily', 'weekly', etc.).
 * @param content - The content to insert/replace.
 * @param options - Patch operation details.
 * @param context - Request context.
 * @returns {Promise<void>} Resolves on success (200 OK).
 */
export async function patchPeriodicNote(
  _request: RequestFunction,
  period: Period,
  content: string | object,
  options: PatchOptions,
  context: RequestContext
): Promise<void> {
  const headers = buildPatchHeaders(options);
  const requestData = typeof content === 'object' ? JSON.stringify(content) : content;

  await _request<void>({
    method: 'PATCH',
    url: `/periodic/${period}/`,
    headers: headers,
    data: requestData,
  }, context, 'patchPeriodicNote');
}
