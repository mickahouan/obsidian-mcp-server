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
    query: { type: "string" },
    fromPath: { type: "string" },
    limit: { type: "integer", minimum: 1, maximum: 50 },
  },
  anyOf: [
    { required: ["query"], not: { required: ["fromPath"] } },
    { required: ["fromPath"], not: { required: ["query"] } },
  ],
  additionalProperties: false,
} as const;

const description =
  'Recherche sémantique locale. Fournir soit `query` pour une recherche textuelle, soit `fromPath` pour trouver des notes voisines. Exemples: smart-search {"query":"mcp","limit":10} smart-search {"fromPath":"/mnt/f/.../Note.md","limit":10}';

export async function registerSemanticSearchTool(
  server: McpServer,
): Promise<void> {
  server.tool(
    "smart-search",
    description,
    inputSchema as any,
    async (params: SemanticSearchInput) => {
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
        const result = await smartSearch({
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
    },
  );
}
