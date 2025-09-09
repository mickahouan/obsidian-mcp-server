import { jest } from "@jest/globals";
import fs from "node:fs/promises";
import path from "node:path";

class MockServer {
  tool(_n, _d, _s, h) {
    this.handler = h;
  }
}

describe("semanticSearchTool", () => {
  afterEach(() => {
    delete process.env.SMART_ENV_DIR;
    delete process.env.SMART_SEARCH_MODE;
    delete process.env.OBSIDIAN_BASE_URL;
    delete process.env.OBSIDIAN_API_KEY;
    delete process.env.ENABLE_QUERY_EMBEDDING;
    delete process.env.QUERY_EMBEDDER;
    const gf = global.fetch;
    if (gf && typeof gf === "function" && typeof gf.mockReset === "function") {
      gf.mockReset();
    }
  });

  test("falls back to tfidf when only query is provided", async () => {
    process.env.SMART_SEARCH_MODE = "lexical";
    process.env.OBSIDIAN_BASE_URL = "http://example.com";
    process.env.OBSIDIAN_API_KEY = "test";
    const responses = {
      "http://example.com/vault": {
        ok: true,
        json: async () => ({ files: [{ path: "A.md" }, { path: "B.md" }] }),
      },
      "http://example.com/vault/A.md": {
        ok: true,
        text: async () => "hello world",
      },
      "http://example.com/vault/B.md": {
        ok: true,
        text: async () => "another note",
      },
    };
    global.fetch = jest.fn((url) =>
      Promise.resolve(responses[url] || { ok: false }),
    );

    const server = new MockServer();
    const { registerSemanticSearchTool } = await import(
      "../../dist/src/tools/semanticSearchTool.js"
    );
    await registerSemanticSearchTool(server, {}, {});
    const res = await server.handler({ query: "hello", limit: 1 }, {});
    const out = res.results ? res : res.content[0].json;
    expect(out.method).toBe("lexical");
    expect(out.encoder).toBe("tfidf");
    expect(out.results[0].path).toBe("A.md");
    expect(typeof out.tookMs).toBe("number");
  });

  test("falls back to tfidf when only fromPath is provided", async () => {
    process.env.SMART_SEARCH_MODE = "lexical";
    process.env.OBSIDIAN_BASE_URL = "http://example.com";
    process.env.OBSIDIAN_API_KEY = "test";
    const responses = {
      "http://example.com/vault": {
        ok: true,
        json: async () => ({
          files: [{ path: "A.md" }, { path: "B.md" }, { path: "C.md" }],
        }),
      },
      "http://example.com/vault/A.md": {
        ok: true,
        text: async () => "hello world",
      },
      "http://example.com/vault/B.md": {
        ok: true,
        text: async () => "hello friend",
      },
      "http://example.com/vault/C.md": {
        ok: true,
        text: async () => "world again",
      },
    };
    global.fetch = jest.fn((url) =>
      Promise.resolve(responses[url] || { ok: false }),
    );

    const server = new MockServer();
    const { registerSemanticSearchTool } = await import(
      "../../dist/src/tools/semanticSearchTool.js"
    );
    await registerSemanticSearchTool(server, {}, {});
    const res = await server.handler({ fromPath: "A.md", limit: 1 }, {});
    const out = res.results ? res : res.content[0].json;
    expect(out.method).toBe("lexical");
    expect(out.encoder).toBe("tfidf");
    expect(out.results[0].path).toBe("B.md");
    expect(typeof out.tookMs).toBe("number");
  });

  test("returns neighbors from .smart-env when fromPath provided", async () => {
    process.env.SMART_SEARCH_MODE = "files";
    const dir = await fs.mkdtemp(path.join(process.cwd(), "smartenv-"));
    await fs.mkdir(path.join(dir, "multi"));
    const aVec = Array(64).fill(0);
    aVec[0] = 1;
    const bVec = Array(64).fill(0);
    bVec[0] = 0.9;
    bVec[1] = 0.1;
    await fs.writeFile(
      path.join(dir, "multi", "A_md.ajson"),
      JSON.stringify({
        embeddings: { m: { vec: aVec } },
        source: { path: "A.md" },
      }),
    );
    await fs.writeFile(
      path.join(dir, "multi", "B_md.ajson"),
      JSON.stringify({
        embeddings: { m: { vec: bVec } },
        source: { path: "B.md" },
      }),
    );
    process.env.SMART_ENV_DIR = dir;

    const server = new MockServer();
    const { registerSemanticSearchTool } = await import(
      "../../dist/src/tools/semanticSearchTool.js"
    );
    await registerSemanticSearchTool(server, {}, {});
    const res = await server.handler({ fromPath: "A.md", limit: 1 }, {});
    const out = res.results ? res : res.content[0].json;
    expect(out.method).toBe("files");
    expect(out.encoder).toBe(".smart-env");
    expect(out.results[0].path).toBe("B.md");
    expect(typeof out.tookMs).toBe("number");
  });

  test("encodes query with xenova when enabled", async () => {
    jest.resetModules();
    process.env.SMART_SEARCH_MODE = "files";
    process.env.SMART_ENV_DIR = await fs.mkdtemp(
      path.join(process.cwd(), "smartenv-"),
    );
    await fs.mkdir(path.join(process.env.SMART_ENV_DIR, "multi"));
    const qaVec = Array(384).fill(0);
    qaVec[0] = 1;
    qaVec[1] = 1;
    const qbVec = Array(384).fill(0);
    qbVec[0] = 1;
    await fs.writeFile(
      path.join(process.env.SMART_ENV_DIR, "multi", "A_md.ajson"),
      JSON.stringify({
        embeddings: { m: { vec: qaVec } },
        source: { path: "A.md" },
      }),
    );
    await fs.writeFile(
      path.join(process.env.SMART_ENV_DIR, "multi", "B_md.ajson"),
      JSON.stringify({
        embeddings: { m: { vec: qbVec } },
        source: { path: "B.md" },
      }),
    );
    process.env.ENABLE_QUERY_EMBEDDING = "true";
    process.env.QUERY_EMBEDDER = "xenova";

    const mockPipe = jest.fn(async () => ({
      data: Array(384).fill(1),
    }));
    jest.unstable_mockModule("@xenova/transformers", () => ({
      pipeline: async () => mockPipe,
    }));

    const server = new MockServer();
    const { registerSemanticSearchTool } = await import(
      "../../dist/src/tools/semanticSearchTool.js"
    );
    await registerSemanticSearchTool(server, {}, {});
    const res = await server.handler({ query: "foo", limit: 1 }, {});
    const out = res.results ? res : res.content[0].json;
    expect(out.method).toBe("files");
    expect(out.encoder).toBe("xenova");
    expect(out.results[0].path).toBe("A.md");
    expect(typeof out.tookMs).toBe("number");
  });
});
