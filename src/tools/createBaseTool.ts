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
    filePath: z
      .string()
      .min(1)
      .describe("Path of the .base file to create."),
    name: z
      .string()
      .default("View")
      .describe("Name of the view."),
    filters: z
      .array(z.string())
      .default([])
      .describe("Filter expressions."),
    order: z
      .array(z.string())
      .default([])
      .describe("Order directives."),
    viewType: z
      .enum(["table", "cards"])
      .default("table")
      .describe("Type de vue."),
    limit: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Nombre maximal d'entrées."),
    properties: z
      .record(z.record(z.any()))
      .optional()
      .describe("Configuration des propriétés de la base (ex. displayName)."),
    formulas: z
      .record(z.string())
      .optional()
      .describe("Formules calculées."),
  })
  .describe("Creates an Obsidian Base (.base) file with a minimal YAML structure.");

export const CreateBaseInputSchemaShape = CreateBaseInputSchema.shape;
export type CreateBaseInput = z.infer<typeof CreateBaseInputSchema>;

export async function registerCreateBaseTool(
  server: McpServer,
  obsidianService: ObsidianRestApiService,
): Promise<void> {
  const toolName = "create-base";
  const toolDescription =
    "Generates an Obsidian Base (.base) file with specified view and filters.";

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
              const filtersExpr =
                params.filters.length === 0
                  ? undefined
                  : params.filters.length === 1
                    ? params.filters[0]
                    : { and: params.filters };

              const doc: any = {
                ...(params.properties ? { properties: params.properties } : {}),
                ...(params.formulas ? { formulas: params.formulas } : {}),
                views: [
                  {
                    type: params.viewType,
                    name: params.name,
                    ...(params.limit ? { limit: params.limit } : {}),
                    ...(filtersExpr ? { filters: filtersExpr } : {}),
                    ...(params.order.length ? { order: params.order } : {}),
                  },
                ],
              };

              const yamlContent = dump(doc);

              await obsidianService.updateFileContent(
                params.filePath,
                yamlContent,
                handlerContext,
              );

              return {
                content: [
                  {
                    type: "application/json",
                    json: { path: params.filePath },
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

