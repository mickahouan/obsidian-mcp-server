import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ObsidianRestApiService } from "../services/obsidianRestAPI/index.js";
import {
  ErrorHandler,
  logger,
  RequestContext,
  requestContextService,
} from "../utils/index.js";
import { BaseErrorCode, McpError } from "../types-global/errors.js";

const ExecuteTemplateInputSchema = z
  .object({
    template: z.string().min(1).describe("Template name or path."),
    variables: z
      .record(z.string())
      .optional()
      .describe("Key-value pairs for template substitution."),
    outputPath: z
      .string()
      .min(1)
      .optional()
      .describe(
        "If provided, the substituted content is written to this path in the vault.",
      ),
  })
  .describe(
    "Executes a template note by replacing {{placeholders}} with provided variables.",
  );

export const ExecuteTemplateInputSchemaShape = ExecuteTemplateInputSchema.shape;
export type ExecuteTemplateInput = z.infer<typeof ExecuteTemplateInputSchema>;

export async function registerExecuteTemplateTool(
  server: McpServer,
  obsidianService: ObsidianRestApiService,
): Promise<void> {
  const toolName = "run-template";
  const toolDescription =
    "Runs a template note with {{placeholders}} replaced and optionally creates a new note.";

  const registrationContext: RequestContext =
    requestContextService.createRequestContext({
      operation: "RegisterExecuteTemplateTool",
      toolName,
      module: "ExecuteTemplateToolRegistration",
    });

  logger.info(`Attempting to register tool: ${toolName}`, registrationContext);

  await ErrorHandler.tryCatch(
    async () => {
      server.tool(
        toolName,
        toolDescription,
        ExecuteTemplateInputSchemaShape,
        async (
          params: ExecuteTemplateInput,
          handlerInvocationContext: any,
        ): Promise<any> => {
          const handlerContext: RequestContext =
            requestContextService.createRequestContext({
              operation: "HandleExecuteTemplateRequest",
              toolName,
              template: params.template,
              outputPath: params.outputPath,
            });
          logger.debug(`Handling '${toolName}' request`, handlerContext);

          return await ErrorHandler.tryCatch(
            async () => {
              const candidates = [params.template];
              if (!params.template.includes("/")) {
                candidates.push(`Templates/${params.template}`);
                candidates.push(`Templates/${params.template}.md`);
                candidates.push(`${params.template}.md`);
              }

              let templateContent: string | null = null;
              let resolvedPath: string | null = null;
              for (const p of candidates) {
                try {
                  const content = await obsidianService.getFileContent(
                    p,
                    "markdown",
                    handlerContext,
                  );
                  if (typeof content === "string") {
                    templateContent = content;
                    resolvedPath = p;
                    break;
                  }
                } catch {
                  // try next
                }
              }

              if (!templateContent) {
                throw new McpError(
                  BaseErrorCode.NOT_FOUND,
                  `Template not found: ${params.template}`,
                  handlerContext,
                );
              }

              const vars = params.variables ?? {};
              const filled = templateContent.replace(
                /\{\{(.*?)\}\}/g,
                (_, name) => {
                  const key = name.trim();
                  return Object.prototype.hasOwnProperty.call(vars, key)
                    ? String(vars[key])
                    : `{{${key}}}`;
                },
              );

              if (params.outputPath) {
                await obsidianService.updateFileContent(
                  params.outputPath,
                  filled,
                  handlerContext,
                );
              }

              return {
                content: [
                  {
                    type: "application/json",
                    json: {
                      template: resolvedPath,
                      outputPath: params.outputPath,
                      content: filled,
                    },
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
