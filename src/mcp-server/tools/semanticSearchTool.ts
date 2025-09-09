import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { smartSearch } from "../../search/smartSearch.js";

export type SemanticSearchInput = {
  query?: string;
  fromPath?: string;
  limit?: number;
};

const inputSchema = {
  type: "object",
  properties: {
    query: {
      type: "string",
      minLength: 1,
      description: "Requête libre",
    },
    fromPath: {
      type: "string",
      minLength: 1,
      description: "Chemin POSIX (suffixe accepté)",
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 50,
      default: 10,
    },
  },
  additionalProperties: false,
  anyOf: [{ required: ["fromPath"] }, { required: ["query"] }],
} as const;

const description =
  'Recherche sémantique via Smart Connections.\nExemples:\nsmart-search {"query":"mcp","limit":10}\nsmart-search {"fromPath":"/mnt/f/OBSIDIAN/ÉLYSIA/Notes/MCP.md","limit":10}';

export async function registerSemanticSearchTool(
  server: McpServer,
): Promise<void> {
  (server as any).tool(
    "smart-search",
    description,
    inputSchema as any,
    (async (params: SemanticSearchInput) => {
      const start = Date.now();
      const limit = Math.max(1, Math.min(50, Math.floor(params?.limit ?? 10)));
      const hasQuery = params?.query?.trim();
      const hasFromPath = params?.fromPath?.trim();

      if (!hasQuery && !hasFromPath) {
        return {
          content: [
            {
              type: "application/json",
              json: {
                method: "lexical",
                results: [],
                tookMs: Date.now() - start,
              },
            },
          ],
          isError: false,
        } as any;
      }

      try {
        const result: any = await smartSearch({
          query: params.query,
          fromPath: params.fromPath,
          limit,
        });
        return {
          content: [
            {
              type: "application/json",
              json: { ...result, tookMs: Date.now() - start },
            },
          ],
          isError: false,
        } as any;
      } catch {
        return {
          content: [
            {
              type: "application/json",
              json: {
                method: "lexical",
                results: [],
                tookMs: Date.now() - start,
              },
            },
          ],
          isError: false,
        } as any;
      }
    }) as any,
  );
}
