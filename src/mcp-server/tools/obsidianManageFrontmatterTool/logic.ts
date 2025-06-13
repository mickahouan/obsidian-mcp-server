import { z } from "zod";
import {
  NoteJson,
  ObsidianRestApiService,
  PatchOptions,
  VaultCacheService,
} from "../../../services/obsidianRestAPI/index.js";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import {
  logger,
  RequestContext,
  retryWithDelay,
} from "../../../utils/index.js";

// ====================================================================================
// Schema Definitions
// ====================================================================================

const ManageFrontmatterInputSchemaBase = z.object({
  filePath: z.string().min(1).describe("The vault-relative path to the target note (e.g., 'Projects/Active/My Note.md')."),
  operation: z.enum(['get', 'set', 'delete']).describe("The operation to perform on the frontmatter: 'get' to read a key, 'set' to create or update a key, or 'delete' to remove a key."),
  key: z.string().min(1).describe("The name of the frontmatter key to target, such as 'status', 'tags', or 'aliases'."),
  value: z.any().optional().describe("The value to assign when using the 'set' operation. Can be a string, number, boolean, array, or a JSON object."),
});

export const ObsidianManageFrontmatterInputSchemaShape = ManageFrontmatterInputSchemaBase.shape;

export const ManageFrontmatterInputSchema = ManageFrontmatterInputSchemaBase.refine(data => {
    if (data.operation === 'set' && data.value === undefined) {
        return false;
    }
    return true;
}, {
    message: "A 'value' is required when the 'operation' is 'set'.",
    path: ["value"],
});

export type ObsidianManageFrontmatterInput = z.infer<typeof ManageFrontmatterInputSchema>;

export interface ObsidianManageFrontmatterResponse {
  success: boolean;
  message: string;
  value?: any;
}

// ====================================================================================
// Core Logic Function
// ====================================================================================

export const processObsidianManageFrontmatter = async (
  params: ObsidianManageFrontmatterInput,
  context: RequestContext,
  obsidianService: ObsidianRestApiService,
  vaultCacheService: VaultCacheService,
): Promise<ObsidianManageFrontmatterResponse> => {
  logger.debug(`Processing obsidian_manage_frontmatter request`, {
    ...context,
    operation: params.operation,
    filePath: params.filePath,
    key: params.key,
  });

  const { filePath, operation, key, value } = params;

  const shouldRetryNotFound = (err: unknown) =>
    err instanceof McpError && err.code === BaseErrorCode.NOT_FOUND;

  const getFileWithRetry = async (
    opContext: RequestContext,
  ): Promise<NoteJson> => {
    return await retryWithDelay(
      () => obsidianService.getFileContent(filePath, "json", opContext) as Promise<NoteJson>,
      {
        operationName: `getFileContentForFrontmatter`,
        context: opContext,
        maxRetries: 3,
        delayMs: 300,
        shouldRetry: shouldRetryNotFound,
      },
    );
  };

  switch (operation) {
    case "get": {
      const note = await getFileWithRetry(context);
      const frontmatter = note.frontmatter ?? {};
      const retrievedValue = frontmatter[key];
      return {
        success: true,
        message: `Successfully retrieved key '${key}' from frontmatter.`,
        value: retrievedValue,
      };
    }

    case "set": {
      const patchOptions: PatchOptions = {
        operation: "replace",
        targetType: "frontmatter",
        target: key,
        createTargetIfMissing: true,
        contentType:
          typeof value === "object" ? "application/json" : "text/markdown",
      };
      const content =
        typeof value === "object" ? JSON.stringify(value) : String(value);

      await retryWithDelay(
        () => obsidianService.patchFile(filePath, content, patchOptions, context),
        {
          operationName: `patchFileForFrontmatterSet`,
          context,
          maxRetries: 3,
          delayMs: 300,
          shouldRetry: shouldRetryNotFound,
        },
      );

      await vaultCacheService.updateCacheForFile(filePath, context);
      const note = await getFileWithRetry(context);
      return {
        success: true,
        message: `Successfully set key '${key}' in frontmatter.`,
        value: note.frontmatter,
      };
    }

    case "delete": {
      const patchOptions: PatchOptions = {
        operation: "replace",
        targetType: "frontmatter",
        target: key,
        contentType: "application/json", // Important for sending null
      };

      // Send 'null' to indicate deletion. The Obsidian API should interpret this
      // as a request to remove the key from the YAML frontmatter.
      await retryWithDelay(
        () => obsidianService.patchFile(filePath, "null", patchOptions, context),
        {
          operationName: `patchFileForFrontmatterDelete`,
          context,
          maxRetries: 3,
          delayMs: 300,
          shouldRetry: shouldRetryNotFound,
        },
      );

      await vaultCacheService.updateCacheForFile(filePath, context);
      const note = await getFileWithRetry(context);
      return {
        success: true,
        message: `Successfully deleted key '${key}' from frontmatter.`,
        value: note.frontmatter,
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
