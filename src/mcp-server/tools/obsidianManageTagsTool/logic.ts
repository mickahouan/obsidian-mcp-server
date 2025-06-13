import { z } from "zod";
import {
  NoteJson,
  ObsidianRestApiService,
  PatchOptions,
  VaultCacheService,
} from "../../../services/obsidianRestAPI/index.js";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import { logger, RequestContext, retryWithDelay } from "../../../utils/index.js";
import { sanitization } from "../../../utils/security/sanitization.js";

// ====================================================================================
// Schema Definitions
// ====================================================================================

const ManageTagsInputSchemaBase = z.object({
  filePath: z.string().min(1).describe("The vault-relative path to the target note (e.g., 'Journal/2024-06-12.md')."),
  operation: z.enum(['add', 'remove', 'list']).describe("The tag operation to perform: 'add' to include new tags, 'remove' to delete existing tags, or 'list' to view all current tags."),
  tags: z.array(z.string()).describe("An array of tag names to be processed. The '#' prefix should be omitted (e.g., use 'project/active', not '#project/active')."),
});

export const ObsidianManageTagsInputSchemaShape = ManageTagsInputSchemaBase.shape;
export const ManageTagsInputSchema = ManageTagsInputSchemaBase;

export type ObsidianManageTagsInput = z.infer<typeof ManageTagsInputSchema>;

export interface ObsidianManageTagsResponse {
  success: boolean;
  message: string;
  currentTags: string[];
}

// ====================================================================================
// Core Logic Function
// ====================================================================================

export const processObsidianManageTags = async (
  params: ObsidianManageTagsInput,
  context: RequestContext,
  obsidianService: ObsidianRestApiService,
  vaultCacheService: VaultCacheService,
): Promise<ObsidianManageTagsResponse> => {
  logger.debug(`Processing obsidian_manage_tags request`, { ...context, ...params });

  const { filePath, operation, tags: inputTags } = params;
  const sanitizedTags = inputTags.map(t => sanitization.sanitizeTagName(t));

  const shouldRetryNotFound = (err: unknown) =>
    err instanceof McpError && err.code === BaseErrorCode.NOT_FOUND;

  const getFileWithRetry = async (
    opContext: RequestContext,
    format: 'json' | 'markdown',
  ): Promise<NoteJson | string> => {
    return await retryWithDelay(
      () => obsidianService.getFileContent(filePath, format, opContext),
      {
        operationName: `getFileContentForTagManagement`,
        context: opContext,
        maxRetries: 3,
        delayMs: 300,
        shouldRetry: shouldRetryNotFound,
      },
    );
  };

  // Always get the initial state of the note
  const initialNote = await getFileWithRetry(context, 'json') as NoteJson;
  let currentTags = initialNote.tags;
  let frontmatter = initialNote.frontmatter ?? {};
  let frontmatterTags: string[] = Array.isArray(frontmatter.tags) ? [...frontmatter.tags] : [];

  switch (operation) {
    case 'list': {
      return {
        success: true,
        message: "Successfully listed all tags.",
        currentTags: currentTags,
      };
    }

    case 'add': {
      const tagsToAdd = sanitizedTags.filter(t => !currentTags.includes(t));
      if (tagsToAdd.length === 0) {
        return {
          success: true,
          message: "No new tags to add; all provided tags already exist in the note.",
          currentTags: currentTags,
        };
      }

      const newFrontmatterTags = [...new Set([...frontmatterTags, ...tagsToAdd])];
      
      const patchOptions: PatchOptions = {
        operation: 'replace',
        targetType: 'frontmatter',
        target: 'tags',
        createTargetIfMissing: true,
        contentType: 'application/json',
      };

      await retryWithDelay(
        () => obsidianService.patchFile(filePath, newFrontmatterTags, patchOptions, context),
        {
          operationName: `patchFileForTagAdd`,
          context,
          maxRetries: 3,
          delayMs: 300,
          shouldRetry: shouldRetryNotFound,
        },
      );
      
      await vaultCacheService.updateCacheForFile(filePath, context);
      const finalNote = await getFileWithRetry(context, 'json') as NoteJson;
      return {
        success: true,
        message: `Successfully added tags: ${tagsToAdd.join(', ')}.`,
        currentTags: finalNote.tags,
      };
    }

    case 'remove': {
      const tagsToRemove = sanitizedTags.filter(t => currentTags.includes(t));
      if (tagsToRemove.length === 0) {
        return {
          success: true,
          message: "No tags to remove; none of the provided tags exist in the note.",
          currentTags: currentTags,
        };
      }

      // 1. Remove from frontmatter
      const newFrontmatterTags = frontmatterTags.filter(t => !tagsToRemove.includes(t));
      if (newFrontmatterTags.length !== frontmatterTags.length) {
        const patchOptions: PatchOptions = {
          operation: 'replace',
          targetType: 'frontmatter',
          target: 'tags',
          contentType: 'application/json',
        };
        await retryWithDelay(
          () => obsidianService.patchFile(filePath, newFrontmatterTags, patchOptions, context),
          {
            operationName: `patchFileForTagRemove`,
            context,
            maxRetries: 3,
            delayMs: 300,
            shouldRetry: shouldRetryNotFound,
          },
        );
      }

      // 2. Remove from inline content
      let content = await getFileWithRetry(context, 'markdown') as string;
      let modified = false;
      for (const tag of tagsToRemove) {
        // This regex is designed to avoid matching tags within words (e.g. #tag in some#tagginess)
        // and to handle various spacings. It looks for a # followed by the tag,
        // ensuring it's not preceded by a letter/number/dash/underscore.
        const regex = new RegExp(`(^|[^\\w-#])#${tag}\\b`, 'g');
        if (regex.test(content)) {
            content = content.replace(regex, '$1');
            modified = true;
        }
      }

      if (modified) {
        await retryWithDelay(
          () => obsidianService.updateFileContent(filePath, content, context),
          {
            operationName: `updateFileContentForTagRemove`,
            context,
            maxRetries: 3,
            delayMs: 300,
            shouldRetry: shouldRetryNotFound,
          },
        );
      }
      
      await vaultCacheService.updateCacheForFile(filePath, context);
      const finalNote = await getFileWithRetry(context, 'json') as NoteJson;
      return {
        success: true,
        message: `Successfully removed tags: ${tagsToRemove.join(', ')}.`,
        currentTags: finalNote.tags,
      };
    }

    default:
      throw new McpError(
        BaseErrorCode.VALIDATION_ERROR,
        `Invalid operation: ${operation}`,
        context,
      );
  }
};
