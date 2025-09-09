import { jest } from "@jest/globals";
import fs from "node:fs/promises";
import path from "node:path";

class MockServer {
  tool(_n, _d, _s, h) {
    this.handler = h;
  }
}

afterEach(() => {
  delete process.env.SMART_ENV_DIR;
  delete process.env.SMART_SEARCH_MODE;
  delete process.env.OBSIDIAN_BASE_URL;
  delete process.env.OBSIDIAN_API_KEY;
  const gf = global.fetch;
  if (gf && typeof gf === "function" && typeof gf.mockReset === "function") {
    gf.mockReset();
  }
});

test("query uses plugin", async () => {
  process.env.SMART_SEARCH_MODE = "plugin";
  process.env.OBSIDIAN_BASE_URL = "http://x";
  process.env.OBSIDIAN_API_KEY = "y";
  global.fetch = jest.fn(async (url) => {
    if (url.startsWith("http://x/search/smart")) {
      return { ok: true, json: async () => ({ results: [{ path: "Note.md", score: 1 }] }) };
    }
    return { ok: true, json: async () => [] };
  });
  const server = new MockServer();
  const { registerSemanticSearchTool } = await import(
    "../../dist/src/mcp-server/tools/semanticSearchTool.js"
  );
  await registerSemanticSearchTool(server);
  const res = await server.handler({ query: "mcp", limit: 5 });
  const out = res.content[0].json;
  expect(out.method).toBe("plugin");
  expect(out.results[0].path).toBe("Note.md");
});

test("fromPath returns neighbors", async () => {
  process.env.SMART_SEARCH_MODE = "files";
  const dir = await fs.mkdtemp(path.join(process.cwd(), "smartenv-"));
  await fs.mkdir(path.join(dir, "multi"));
  const aVec = Array(64).fill(0);
  aVec[0] = 1;
  const bVec = Array(64).fill(0);
  bVec[1] = 1;
  await fs.writeFile(
    path.join(dir, "multi", "A_md.ajson"),
    JSON.stringify({ embeddings: { m: { vec: aVec } }, source: { path: "A.md" } }),
  );
  await fs.writeFile(
    path.join(dir, "multi", "B_md.ajson"),
    JSON.stringify({ embeddings: { m: { vec: bVec } }, source: { path: "B.md" } }),
  );
  process.env.SMART_ENV_DIR = dir;
  const server = new MockServer();
  const { registerSemanticSearchTool } = await import(
    "../../dist/src/mcp-server/tools/semanticSearchTool.js"
  );
  await registerSemanticSearchTool(server);
  const res = await server.handler({ fromPath: "A.md", limit: 1 });
  const out = res.content[0].json;
  expect(out.method).toBe("files");
  expect(out.results[0].path).toBe("B.md");
});
