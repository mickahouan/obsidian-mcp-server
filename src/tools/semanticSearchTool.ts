import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { smartSearch } from "../search/smartSearch.js";

export type Input = { query?: string; fromPath?: string; limit?: number };
export type Output = {
  method: "plugin" | "files" | "lexical";
  results: { path: string; score: number }[];
  encoder: string;
  dim: number;
  poolSize: number;
  tookMs: number;
};

const tool = {
  name: "smart-search",
  description:
    "Recherche sémantique locale : utilise Smart Connections (.smart-env) si disponible, sinon fallback TF-IDF. Accepte `query` (texte) ou `fromPath` (voisins d’une note).",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
      fromPath: { type: "string" },
      limit: { type: "number" },
    },
  },
  async execute(input: Input): Promise<Output> {
    const hasQuery = !!input?.query?.trim();
    const hasFrom = !!input?.fromPath?.trim();
    if (!hasQuery && !hasFrom) {
      return {
        method: "lexical",
        results: [],
        encoder: "tfidf",
        dim: 0,
        poolSize: 0,
        tookMs: 0,
      };
    }
    try {
      return await smartSearch(input);
    } catch {
      return {
        method: "lexical",
        results: [],
        encoder: "tfidf",
        dim: 0,
        poolSize: 0,
        tookMs: 0,
      };
    }
  },
};

export default tool;

export async function registerSemanticSearchTool(
  server: McpServer,
  _obsidian: any,
  _vault?: any,
): Promise<void> {
  server.tool(
    tool.name,
    tool.description,
    tool.inputSchema as any,
    async (args: any) => {
      const result = await tool.execute(args as Input);
      return {
        content: [{ type: "application/json", json: result } as any],
        isError: false,
      } as any;
    },
  );
}
