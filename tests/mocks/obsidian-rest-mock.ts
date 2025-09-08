import express from "express";
import path from "node:path";
import fs from "node:fs/promises";

export interface MockServer {
  app: express.Express;
  server: ReturnType<typeof app.listen>;
  close: () => Promise<void>;
}

export async function startObsidianRestMock(
  vaultDir: string,
  options: { port?: number; token?: string } = {},
): Promise<MockServer> {
  const port = options.port ?? 27123;
  const token = options.token ?? process.env.OBSIDIAN_API_TOKEN ?? "test-token";

  const app = express();
  app.use(express.json());

  // auth middleware
  app.use((req, res, next) => {
    if (req.path === "/health") return next();
    const auth = req.header("authorization");
    if (auth !== `Bearer ${token}`) {
      return res.status(401).json({ error: "unauthorized" });
    }
    next();
  });

  app.get("/health", (_req, res) => {
    res.json({ authenticated: true });
  });

  app.get("/vault/*", async (req, res) => {
    const relPath = req.params[0];
    const filePath = path.join(vaultDir, relPath);
    try {
      const data = await fs.readFile(filePath, "utf8");
      res.send(data);
    } catch {
      res.status(404).send("Not Found");
    }
  });

  app.post("/vault/*", async (req, res) => {
    const relPath = req.params[0];
    const filePath = path.join(vaultDir, relPath);
    const content = typeof req.body === "string" ? req.body : req.body.content;
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content ?? "", "utf8");
    res.json({ success: true });
  });

  const server = app.listen(port);
  return {
    app,
    server,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
