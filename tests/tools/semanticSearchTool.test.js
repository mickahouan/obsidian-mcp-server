process.env.OBSIDIAN_API_KEY = "test";
import { jest } from "@jest/globals";

class MockServer {
  tool(_n, _d, _s, h) {
    this.handler = h;
  }
}

describe("semanticSearchTool", () => {
  test("uses plugin when available", async () => {
    process.env.SMART_SEARCH_MODE = "plugin";
    jest.resetModules();
    const obsidian = {
      smartSearch: async () => ({
        results: [{ filePath: "A.md", score: 0.9 }],
      }),
    };
    const vault = { getCache: () => new Map() };
    const server = new MockServer();
    const { registerSemanticSearchTool } = await import(
      "../../dist/tools/semanticSearchTool.js"
    );
    await registerSemanticSearchTool(server, obsidian, vault);
    const res = await server.handler({ query: "hello", limit: 5 }, {});
    expect(res.content[0].json.method).toBe("plugin");
    expect(res.content[0].json.results[0].path).toBe("A.md");
  });

  test("falls back to tfidf when plugin fails", async () => {
    process.env.SMART_SEARCH_MODE = "auto";
    jest.resetModules();
    let called = 0;
    const obsidian = {
      smartSearch: async () => {
        called++;
        throw new Error("no plugin");
      },
    };
    const vault = {
      getCache: () =>
        new Map([
          ["A.md", { content: "hello world" }],
          ["B.md", { content: "another note" }],
        ]),
    };
    const server = new MockServer();
    const { registerSemanticSearchTool } = await import(
      "../../dist/tools/semanticSearchTool.js"
    );
    await registerSemanticSearchTool(server, obsidian, vault);
    const res = await server.handler({ query: "hello", limit: 1 }, {});
    expect(called).toBe(1);
    expect(res.content[0].json.method).toBe("lexical");
    expect(res.content[0].json.results[0].path).toBe("A.md");
  });

  test("uses smart-env files when mode is files", async () => {
    process.env.SMART_SEARCH_MODE = "files";
    jest.resetModules();
    await jest.unstable_mockModule(
      "../../dist/search/providers/smartEnvFiles.js",
      () => ({
        neighborsFromSmartEnv: jest
          .fn()
          .mockResolvedValue([{ path: "B.md", score: 0.5 }]),
      }),
    );
    const obsidian = { smartSearch: jest.fn() };
    const vault = { getCache: () => new Map() };
    const server = new MockServer();
    const { registerSemanticSearchTool } = await import(
      "../../dist/tools/semanticSearchTool.js"
    );
    await registerSemanticSearchTool(server, obsidian, vault);
    const res = await server.handler({ fromPath: "A.md", limit: 5 }, {});
    expect(res.content[0].json.method).toBe("files");
    expect(res.content[0].json.results[0].path).toBe("B.md");
  });
});
