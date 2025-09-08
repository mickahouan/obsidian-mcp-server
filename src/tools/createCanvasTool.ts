import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ObsidianRestApiService } from "../services/obsidianRestAPI/index.js";
import {
  ErrorHandler,
  logger,
  RequestContext,
  requestContextService,
} from "../utils/index.js";
import { BaseErrorCode } from "../types-global/errors.js";

const CanvasNodeSchema = z.object({
  id: z.string().optional(),
  type: z.enum(["file", "text", "link", "group"]),
  file: z.string().optional(),
  text: z.string().optional(),
  url: z.string().optional(),
  label: z.string().optional(),
  background: z.string().optional(),
  backgroundStyle: z.enum(["cover", "ratio", "repeat"]).optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  color: z.string().optional(),
});

const CanvasEdgeSchema = z.object({
  id: z.string().optional(),
  fromNode: z.string(),
  toNode: z.string(),
  fromSide: z.enum(["top", "right", "bottom", "left"]).optional(),
  toSide: z.enum(["top", "right", "bottom", "left"]).optional(),
  fromEnd: z.enum(["none", "arrow"]).optional(),
  toEnd: z.enum(["none", "arrow"]).optional(),
  color: z.string().optional(),
  label: z.string().optional(),
});

const CreateCanvasInputSchema = z
  .object({
    name: z.string().min(1).describe("Name of the canvas."),
    nodes: z.array(CanvasNodeSchema).optional(),
    edges: z.array(CanvasEdgeSchema).optional(),
  })
  .describe("Creates an Obsidian Canvas (.canvas) file.");

export const CreateCanvasInputSchemaShape = CreateCanvasInputSchema.shape;
export type CreateCanvasInput = z.infer<typeof CreateCanvasInputSchema>;

export async function registerCreateCanvasTool(
  server: McpServer,
  obsidianService: ObsidianRestApiService,
): Promise<void> {
  const toolName = "create-canvas";
  const toolDescription =
    "Generates an Obsidian canvas file with optional nodes and edges.";

  const registrationContext: RequestContext =
    requestContextService.createRequestContext({
      operation: "RegisterCreateCanvasTool",
      toolName,
      module: "CreateCanvasToolRegistration",
    });

  logger.info(`Attempting to register tool: ${toolName}`, registrationContext);

  await ErrorHandler.tryCatch(
    async () => {
      server.tool(
        toolName,
        toolDescription,
        CreateCanvasInputSchemaShape,
        async (
          params: CreateCanvasInput,
          handlerInvocationContext: any,
        ): Promise<any> => {
          const handlerContext: RequestContext =
            requestContextService.createRequestContext({
              operation: "HandleCreateCanvasRequest",
              toolName,
              canvasName: params.name,
            });
          logger.debug(`Handling '${toolName}' request`, handlerContext);

          return await ErrorHandler.tryCatch(
            async () => {
              const nodes = (params.nodes ?? []).map((node, idx) => ({
                id: node.id ?? randomUUID(),
                type: node.type,
                x: node.x ?? idx * 300,
                y: node.y ?? 0,
                width: node.width ?? 200,
                height: node.height ?? 200,
                ...(node.color ? { color: node.color } : {}),
                ...(node.type === "file" && node.file
                  ? { file: node.file }
                  : {}),
                ...(node.type === "text" ? { text: node.text ?? "" } : {}),
                ...(node.type === "link" && node.url ? { url: node.url } : {}),
                ...(node.type === "group"
                  ? {
                      ...(node.label ? { label: node.label } : {}),
                      ...(node.background ? { background: node.background } : {}),
                      ...(node.backgroundStyle
                        ? { backgroundStyle: node.backgroundStyle }
                        : {}),
                    }
                  : {}),
              }));

              const edges = (params.edges ?? []).map((edge) => ({
                id: edge.id ?? randomUUID(),
                fromNode: edge.fromNode,
                toNode: edge.toNode,
                ...(edge.fromSide ? { fromSide: edge.fromSide } : {}),
                ...(edge.toSide ? { toSide: edge.toSide } : {}),
                ...(edge.fromEnd ? { fromEnd: edge.fromEnd } : {}),
                ...(edge.toEnd ? { toEnd: edge.toEnd } : {}),
                ...(edge.color ? { color: edge.color } : {}),
                ...(edge.label ? { label: edge.label } : {}),
              }));

              const canvas = { nodes, edges };

              const filePath = `${params.name}.canvas`;
              await obsidianService.updateFileContent(
                filePath,
                JSON.stringify(canvas, null, 2),
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
