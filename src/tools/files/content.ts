/**
 * File content manipulation tools implementation
 */
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { ObsidianClient } from "../../obsidian/client.js";
import { createLogger } from "../../utils/logging.js";
import { BaseToolHandler } from "../base.js";

// Create a logger for file content operations
const logger = createLogger('FileContentTools');

/**
 * Tool names for file content operations
 */
export const FILE_CONTENT_TOOL_NAMES = {
  GET_FILE_CONTENTS: "obsidian_get_file_contents",
  APPEND_CONTENT: "obsidian_append_content",
  UPDATE_CONTENT: "obsidian_update_content" // Renamed from PATCH_CONTENT
} as const;

/**
 * Arguments for file content operations
 */
export interface FileContentsArgs {
  filepath: string;
}

/**
 * Arguments for appending content to a file
 */
export interface AppendContentArgs {
  filepath: string;
  content: string;
}

/**
 * Arguments for updating content of a file
 */
export interface UpdateContentArgs { // Renamed from PatchContentArgs
  filepath: string;
  content: string;
}

/**
 * Tool handler for getting file contents
 */
export class GetFileContentsToolHandler extends BaseToolHandler<FileContentsArgs> {
  constructor(client: ObsidianClient) {
    super(FILE_CONTENT_TOOL_NAMES.GET_FILE_CONTENTS, client);
  }

  getToolDescription(): Tool {
    return {
      name: this.name,
      description: "Retrieves the full content of a specified file within your Obsidian vault. Supports various readable file formats.",
      examples: [
        {
          description: "Get content of a markdown note",
          args: {
            filepath: "Projects/research.md"
          }
        },
        {
          description: "Get content of a configuration file",
          args: {
            filepath: "configs/settings.yml"
          }
        }
      ],
      inputSchema: {
        type: "object",
        properties: {
          filepath: {
            type: "string",
            description: "Path to the relevant file (relative to your vault root).",
            format: "path"
          }
        },
        required: ["filepath"]
      }
    };
  }

  async runTool(args: FileContentsArgs): Promise<Array<any>> {
    try {
      logger.debug(`Getting contents of file: ${args.filepath}`);
      const content = await this.client.getFileContents(args.filepath);
      return this.createResponse(content);
    } catch (error) {
      return this.handleError(error);
    }
  }
}

/**
 * Tool handler for appending content to a file
 */
export class AppendContentToolHandler extends BaseToolHandler<AppendContentArgs> {
  constructor(client: ObsidianClient) {
    super(FILE_CONTENT_TOOL_NAMES.APPEND_CONTENT, client);
  }

  getToolDescription(): Tool {
    return {
      name: this.name,
      description: "Appends the provided content to the end of a specified file in the vault. If the file does not exist, it will be created.",
      examples: [
        {
          description: "Append a new task",
          args: {
            filepath: "tasks.md",
            content: "- [ ] New task to complete"
          }
        },
        {
          description: "Append meeting notes",
          args: {
            filepath: "meetings/2025-01-23.md",
            content: "## Meeting Notes\n\n- Discussed project timeline\n- Assigned tasks"
          }
        }
      ],
      inputSchema: {
        type: "object",
        properties: {
          filepath: {
            type: "string",
            description: "Path to the file (relative to vault root)",
            format: "path"
          },
          content: {
            type: "string",
            description: "Content to append to the file"
          }
        },
        required: ["filepath", "content"]
      }
    };
  }

  async runTool(args: AppendContentArgs): Promise<Array<any>> {
    try {
      logger.debug(`Appending content to file: ${args.filepath}`);
      await this.client.appendContent(args.filepath, args.content);
      return this.createResponse({ 
        message: `Successfully appended content to ${args.filepath}`,
        success: true
      });
    } catch (error) {
      return this.handleError(error);
    }
  }
}

/**
 * Tool handler for updating file content
 */
export class UpdateContentToolHandler extends BaseToolHandler<UpdateContentArgs> { // Renamed from PatchContentToolHandler
  constructor(client: ObsidianClient) {
    super(FILE_CONTENT_TOOL_NAMES.UPDATE_CONTENT, client); // Renamed from PATCH_CONTENT
  }

  getToolDescription(): Tool {
    return {
      name: this.name, // Will be obsidian_update_content
      description: "Overwrites the entire content of a specified file in the vault with the provided content. If the file does not exist, it will be created.",
      examples: [
        {
          description: "Overwrite a note's content",
          args: {
            filepath: "project.md",
            content: "# Project Notes\n\nThis will replace the entire content of the note."
          }
        }
      ],
      inputSchema: {
        type: "object",
        properties: {
          filepath: {
            type: "string",
            description: "Path to the file (relative to vault root)",
            format: "path"
          },
          content: {
            type: "string",
            description: "The new, complete content for the file (overwrites existing content)."
          }
        },
        required: ["filepath", "content"]
      }
    };
  }

  async runTool(args: UpdateContentArgs): Promise<Array<any>> { // Renamed from PatchContentArgs
    try {
      logger.debug(`Updating content of file: ${args.filepath}`);
      await this.client.updateContent(args.filepath, args.content);
      return this.createResponse({ 
        message: `Successfully updated content in ${args.filepath}`,
        success: true
      });
    } catch (error) {
      return this.handleError(error);
    }
  }
}
