import { z } from "zod";
import { dump } from "js-yaml";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ObsidianRestApiService } from "../services/obsidianRestAPI/index.js";
import {
  ErrorHandler,
  logger,
  RequestContext,
  requestContextService,
} from "../utils/index.js";
import { BaseErrorCode } from "../types-global/errors.js";

const CreateBaseInputSchema = z
  .object({
    name: z.string().min(1).describe("Name of the base."),
    filters: z.record(z.any()).default({}).describe("Filter criteria."),
    columns: z
      .array(z.string())
      .nonempty()
      .describe("Properties to display as columns."),
    sort: z.string().optional().describe("Field to sort by."),
  })
  .describe("Creates an Obsidian Base (.base) file with given filters and columns.");

export const CreateBaseInputSchemaShape = CreateBaseInputSchema.shape;
export type CreateBaseInput = z.infer<typeof CreateBaseInputSchema>;

export async function registerCreateBaseTool(
  server: McpServer,
  obsidianService: ObsidianRestApiService,
): Promise<void> {
  const toolName = "create-base";
  const toolDescription =
    "Generates an Obsidian Base (.base) file with specified filters and columns.";

  const registrationContext: RequestContext =
    requestContextService.createRequestContext({
      operation: "RegisterCreateBaseTool",
      toolName,
      module: "CreateBaseToolRegistration",
    });

  logger.info(`Attempting to register tool: ${toolName}`, registrationContext);

  await ErrorHandler.tryCatch(
    async () => {
      server.tool(
        toolName,
        toolDescription,
        CreateBaseInputSchemaShape,
        async (
          params: CreateBaseInput,
          handlerInvocationContext: any,
        ): Promise<any> => {
          const handlerContext: RequestContext =
            requestContextService.createRequestContext({
              operation: "HandleCreateBaseRequest",
              toolName,
              baseName: params.name,
            });
          logger.debug(`Handling '${toolName}' request`, handlerContext);

          return await ErrorHandler.tryCatch(
            async () => {
              const yamlContent = dump({
                filters: params.filters,
                columns: params.columns,
                ...(params.sort ? { sort: params.sort } : {}),
                views: [
                  {
                    type: "table",
                    name: params.name,
                  },
                ],
              });

              const filePath = `${params.name}.base`;
              await obsidianService.updateFileContent(
                filePath,
                yamlContent,
                handlerContext,
              );

              return {
                content: [
                  {
                    type: "application/json",
                    json: { path: filePath },
                  },
                ],
                isError: false,
              };
            },
            {
              operation: `executing tool ${toolName}`,
              context: handlerContext,
              errorCode: BaseErrorCode.INTERNAL_ERROR,
            },
          );
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
      critical: true,
    },
  );
}

