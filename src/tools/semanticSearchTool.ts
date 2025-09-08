import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { smartSearch } from "../search/smartSearch.js";
import type { VaultCacheService } from "../services/obsidianRestAPI/vaultCache/index.js";

export type Input = { query?: string; fromPath?: string; limit?: number };
export type Output = {
  method: "plugin" | "files" | "lexical";
  results: { path: string; score: number }[];
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
  async execute(input: Input, vcs?: VaultCacheService): Promise<Output> {
    try {
      return await smartSearch(input, vcs);
    } catch {
      return { method: "lexical", results: [] };
    }
  },
};

export default tool;

export async function registerSemanticSearchTool(
  server: McpServer,
  _obsidian: any,
  vaultCacheService?: VaultCacheService,
): Promise<void> {
  server.tool(
    tool.name,
    tool.description,
    tool.inputSchema as any,
    async (args: any) => {
      const result = await tool.execute(args as Input, vaultCacheService);
      return {
        content: [{ type: "application/json", json: result } as any],
        isError: false,
      } as any;
    },
  );
}
