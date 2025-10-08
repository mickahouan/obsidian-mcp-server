/*
 * Obsidian Bases Bridge plugin.
 *
 * This plugin exposes the core Bases features (query, schema, upsert, config)
 * over HTTP by extending the Obsidian Local REST API plugin. It also registers
 * a headless Bases view to reuse the built-in engine whenever possible while
 * keeping a disk-based fallback for environments where the view is inactive.
 */

import { App, Plugin, TFile, normalizePath, parseYaml, stringifyYaml } from "obsidian";
import { createServer, IncomingMessage, Server, ServerResponse } from "node:http";
import { URL } from "node:url";

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

type SortDirection = "asc" | "desc";

type AdditionalFilter = {
  eq?: Record<string, unknown>;
  in?: Record<string, unknown[]>;
  regex?: Record<string, string>;
  and?: AdditionalFilter[];
  or?: AdditionalFilter[];
  not?: AdditionalFilter;
};

interface QueryPayload {
  view?: string;
  filter?: AdditionalFilter;
  sort?: Array<{ prop: string; dir?: SortDirection }>;
  limit?: number;
  page?: number;
  evaluate?: boolean;
}

interface UpsertOperation {
  file: string;
  set?: Record<string, unknown>;
  unset?: string[];
  expected_mtime?: number;
}

interface UpsertPayload {
  operations: UpsertOperation[];
  continueOnError?: boolean;
}

interface BaseCreatePayload {
  path: string;
  spec: Record<string, unknown>;
  overwrite?: boolean;
  validateOnly?: boolean;
}

interface BaseConfigPayload {
  yaml?: string;
  json?: Record<string, unknown>;
  validateOnly?: boolean;
}

interface BridgeRow {
  file: { path: string; name: string };
  props: Record<string, unknown>;
  computed: Record<string, unknown>;
}

interface EngineCacheEntry {
  baseId: string;
  rows: BridgeRow[];
  order: string[];
  evaluate: boolean;
  timestamp: number;
}

interface BaseDefinition {
  filters?: Record<string, unknown> | undefined;
  formulas?: Record<string, unknown> | undefined;
  properties?: Record<string, any> | undefined;
  views?: Array<Record<string, any>> | undefined;
}

// ---------------------------------------------------------------------------
// Headless view implementation (best-effort, resilient to API changes)
// ---------------------------------------------------------------------------

class HeadlessBridgeView {
  private controller: any;
  private cache: Map<string, EngineCacheEntry>;

  constructor(controller: any, cache: Map<string, EngineCacheEntry>) {
    this.controller = controller;
    this.cache = cache;
    // Ensure the container stays empty (headless view)
    if (controller?.containerEl) {
      controller.containerEl.empty?.();
      controller.containerEl.toggleClass?.("bases-bridge-hidden", true);
    }
  }

  onDataUpdated(): void {
    try {
      const baseFile: TFile | undefined = this.controller?.baseFile;
      const baseId = baseFile?.path;
      if (!baseId) {
        return;
      }

      const order: string[] =
        this.controller?.config?.getOrder?.() ??
        this.controller?.config?.getSortOrder?.() ??
        [];

      const entries: any[] =
        this.controller?.data?.entries ??
        this.controller?.data?.rows ??
        this.controller?.rows ??
        [];

      const rows: BridgeRow[] = entries.map((entry: any) => {
        const file: { path: string; name: string } = {
          path: entry?.file?.path ?? entry?.path ?? entry?.getFile?.()?.path ?? "",
          name:
            entry?.file?.name ??
            entry?.file?.basename ??
            entry?.getFile?.()?.name ??
            entry?.getFile?.()?.basename ??
            "",
        };

        const props: Record<string, unknown> = {};
        const computed: Record<string, unknown> = {};
        const propertyKeys: string[] =
          this.controller?.config?.getVisibleColumns?.() ?? order ?? [];

        if (typeof entry?.getValue === "function") {
          for (const key of propertyKeys) {
            try {
              const value = entry.getValue(key);
              if (key.startsWith("file.")) {
                computed[key] = normalizeEngineValue(value);
              } else {
                props[key] = normalizeEngineValue(value);
              }
            } catch (error) {
              console.error("[Bases Bridge] Failed to read value", key, error);
            }
          }
        } else if (entry?.values) {
          for (const key of Object.keys(entry.values)) {
            const value = entry.values[key];
            if (key.startsWith("file.")) {
              computed[key] = normalizeEngineValue(value);
            } else {
              props[key] = normalizeEngineValue(value);
            }
          }
        }

        return { file, props, computed };
      });

      this.cache.set(baseId, {
        baseId,
        rows,
        order,
        evaluate: true,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error("[Bases Bridge] Failed to refresh engine dataset", error);
    }
  }

  onunload(): void {
    // Nothing to clean up explicitly; the parent plugin clears cache entries.
  }
}

// ---------------------------------------------------------------------------
// Plugin main class
// ---------------------------------------------------------------------------

export default class BasesBridgePlugin extends Plugin {
  private engineCache = new Map<string, EngineCacheEntry>();
  private microServer: Server | null = null;
  private readonly microServerPort = 3117;

  async onload(): Promise<void> {
    console.info("[Bases Bridge] Initialising plugin");
    this.registerHeadlessView();
    await this.registerRestExtension();
  }

  async onunload(): Promise<void> {
    this.engineCache.clear();
    if (this.microServer) {
      this.microServer.close();
      this.microServer = null;
    }
  }

  // -----------------------------------------------------------------------
  // Headless view registration
  // -----------------------------------------------------------------------

  private registerHeadlessView(): void {
    const register = (this as unknown as { registerBasesView?: (...args: any[]) => void }).registerBasesView;
    if (typeof register !== "function") {
      console.warn("[Bases Bridge] registerBasesView API unavailable. Engine mode disabled.");
      return;
    }

    try {
      register.call(this, "bases-bridge-headless", {
        name: "Bridge (Headless)",
        icon: "plug-zap",
        factory: (controller: any, containerEl: HTMLElement) => {
          containerEl.empty?.();
          containerEl.toggleClass?.("bases-bridge-hidden", true);
          const view = new HeadlessBridgeView(controller, this.engineCache);
          this.register(() => view.onunload());
          return view;
        },
      });
      console.info("[Bases Bridge] Headless view registered");
    } catch (error) {
      console.error("[Bases Bridge] Failed to register headless view", error);
    }
  }

  // -----------------------------------------------------------------------
  // REST registration (extension + fallback microserver)
  // -----------------------------------------------------------------------

  private async registerRestExtension(): Promise<void> {
    const restPlugin: any = (this.app as App & { plugins: any }).plugins?.getPlugin?.(
      "obsidian-local-rest-api",
    );

    if (restPlugin?.getPublicApi) {
      try {
        const api = restPlugin.getPublicApi(this.manifest);
        const baseRoute = api.addRoute("/bases");
        baseRoute.get(async (req: any, res: any) => {
          try {
            const bases = await this.handleListBases();
            res.json({ bases });
          } catch (error) {
            this.returnExpressError(res, error);
          }
        });
        baseRoute.post(async (req: any, res: any) => {
          await this.handleCreateBaseExpress(req, res);
        });

        api
          .addRoute("/bases/:id/schema")
          .get(async (req: any, res: any) => {
            await this.handleGetSchemaExpress(req, res);
          });

        api
          .addRoute("/bases/:id/query")
          .post(async (req: any, res: any) => {
            await this.handleQueryExpress(req, res);
          });

        api
          .addRoute("/bases/:id/upsert")
          .post(async (req: any, res: any) => {
            await this.handleUpsertExpress(req, res);
          });

        api
          .addRoute("/bases/:id/config")
          .get(async (req: any, res: any) => {
            await this.handleGetConfigExpress(req, res);
          })
          .put(async (req: any, res: any) => {
            await this.handlePutConfigExpress(req, res);
          });

        console.info("[Bases Bridge] Routes registered via Local REST API extension");
        return;
      } catch (error) {
        console.error("[Bases Bridge] Failed to register REST extension", error);
      }
    }

    // Fallback micro-server
    this.startMicroServer();
  }

  private startMicroServer(): void {
    if (this.microServer) {
      return;
    }

    this.microServer = createServer(async (req, res) => {
      try {
        await this.routeMicroRequest(req, res);
      } catch (error) {
        this.sendMicroError(res, error);
      }
    });

    this.microServer.listen(this.microServerPort, "127.0.0.1", () => {
      console.warn(
        `[Bases Bridge] Using fallback HTTP server on http://127.0.0.1:${this.microServerPort}/ (extension API indisponible)`,
      );
    });
  }

  private async routeMicroRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!req.url || !req.method) {
      this.sendMicroError(res, new Error("Invalid request"));
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host ?? "127.0.0.1"}`);
    const path = url.pathname.replace(/\/$/, "");
    const method = req.method.toUpperCase();

    // CORS (localhost uniquement)
    res.setHeader("Access-Control-Allow-Origin", "http://localhost");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }

    const body = await readBody(req);

    if (method === "GET" && path === "/bases") {
      const bases = await this.handleListBases();
      this.writeJson(res, { bases });
      return;
    }

    const schemaMatch = path.match(/^\/bases\/(.+)\/schema$/);
    const queryMatch = path.match(/^\/bases\/(.+)\/query$/);
    const upsertMatch = path.match(/^\/bases\/(.+)\/upsert$/);
    const configMatch = path.match(/^\/bases\/(.+)\/config$/);

    if (schemaMatch && method === "GET") {
      const baseId = decodeURIComponent(schemaMatch[1]);
      const schema = await this.readBaseSchema(baseId);
      this.writeJson(res, schema);
      return;
    }

    if (queryMatch && method === "POST") {
      const baseId = decodeURIComponent(queryMatch[1]);
      const payload = (body ? JSON.parse(body) : {}) as QueryPayload;
      const result = await this.executeQuery(baseId, payload);
      this.writeJson(res, result);
      return;
    }

    if (upsertMatch && method === "POST") {
      const baseId = decodeURIComponent(upsertMatch[1]);
      const payload = (body ? JSON.parse(body) : {}) as UpsertPayload;
      const result = await this.performUpsert(baseId, payload);
      this.writeJson(res, result, 200);
      return;
    }

    if (method === "POST" && path === "/bases") {
      const payload = (body ? JSON.parse(body) : {}) as BaseCreatePayload;
      const result = await this.createBaseFile(payload);
      this.writeJson(res, result, 201);
      return;
    }

    if (configMatch) {
      const baseId = decodeURIComponent(configMatch[1]);
      if (method === "GET") {
        const result = await this.getBaseConfig(baseId);
        this.writeJson(res, result);
        return;
      }
      if (method === "PUT") {
        const payload = (body ? JSON.parse(body) : {}) as BaseConfigPayload;
        const result = await this.upsertBaseConfig(baseId, payload);
        this.writeJson(res, result);
        return;
      }
    }

    this.writeJson(res, { error: "Not Found" }, 404);
  }

  private writeJson(res: ServerResponse, payload: any, status = 200): void {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payload));
  }

  private sendMicroError(res: ServerResponse, error: unknown): void {
    console.error("[Bases Bridge] Micro server error", error);
    const status = error instanceof HttpError ? error.status : 500;
    this.writeJson(res, { error: (error as Error)?.message ?? "Internal error" }, status);
  }

  private returnExpressError(res: any, error: unknown): void {
    console.error("[Bases Bridge] REST error", error);
    const status = error instanceof HttpError ? error.status : 500;
    res.status(status).json({ error: (error as Error)?.message ?? "Internal error" });
  }

  // -----------------------------------------------------------------------
  // Express helpers
  // -----------------------------------------------------------------------

  private async handleCreateBaseExpress(req: any, res: any): Promise<void> {
    try {
      const result = await this.createBaseFile(req.body as BaseCreatePayload);
      res.status(result.ok && !req.body?.validateOnly ? 201 : 200).json(result);
    } catch (error) {
      this.returnExpressError(res, error);
    }
  }

  private async handleGetSchemaExpress(req: any, res: any): Promise<void> {
    try {
      const baseId = decodeURIComponent(req.params.id);
      const schema = await this.readBaseSchema(baseId);
      res.json(schema);
    } catch (error) {
      this.returnExpressError(res, error);
    }
  }

  private async handleQueryExpress(req: any, res: any): Promise<void> {
    try {
      const baseId = decodeURIComponent(req.params.id);
      const payload = req.body as QueryPayload;
      const result = await this.executeQuery(baseId, payload ?? {});
      res.json(result);
    } catch (error) {
      this.returnExpressError(res, error);
    }
  }

  private async handleUpsertExpress(req: any, res: any): Promise<void> {
    try {
      const baseId = decodeURIComponent(req.params.id);
      const payload = req.body as UpsertPayload;
      const result = await this.performUpsert(baseId, payload ?? { operations: [] });
      res.json(result);
    } catch (error) {
      this.returnExpressError(res, error);
    }
  }

  private async handleGetConfigExpress(req: any, res: any): Promise<void> {
    try {
      const baseId = decodeURIComponent(req.params.id);
      const result = await this.getBaseConfig(baseId);
      res.json(result);
    } catch (error) {
      this.returnExpressError(res, error);
    }
  }

  private async handlePutConfigExpress(req: any, res: any): Promise<void> {
    try {
      const baseId = decodeURIComponent(req.params.id);
      const payload = req.body as BaseConfigPayload;
      const result = await this.upsertBaseConfig(baseId, payload ?? {});
      res.json(result);
    } catch (error) {
      this.returnExpressError(res, error);
    }
  }

  // -----------------------------------------------------------------------
  // Core operations
  // -----------------------------------------------------------------------

  private async handleListBases(): Promise<Array<{ id: string; name: string; path: string }>> {
    return this.app.vault
      .getFiles()
      .filter((file) => file.extension === "base")
      .map((file) => ({ id: file.path, name: file.basename, path: file.path }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  private async readBaseSchema(baseId: string): Promise<Record<string, unknown>> {
    const { file, config, yaml } = await this.loadBaseConfig(baseId);
    const properties = Object.entries(config.properties ?? {}).map(([key, value]) => {
      const record = (value ?? {}) as Record<string, unknown>;
      const kind = inferPropertyKind(key, record);
      return {
        key,
        kind,
        displayName: typeof record.displayName === "string" ? record.displayName : undefined,
        valueType: typeof record.valueType === "string" ? record.valueType : undefined,
      };
    });

    const views = Array.isArray(config.views)
      ? config.views.map((view: any) => ({
          name: view?.name ?? "",
          type: view?.type ?? "table",
          limit: view?.limit,
          order: Array.isArray(view?.order) ? view.order : [],
          filters: view?.filters,
          description: view?.description,
        }))
      : [];

    return {
      id: file.path,
      path: file.path,
      name: file.basename,
      yaml,
      properties,
      formulas: config.formulas ?? {},
      views,
      filters: config.filters ?? {},
    };
  }

  private async executeQuery(baseId: string, payload: QueryPayload): Promise<Record<string, unknown>> {
    const evaluate = payload.evaluate ?? false;
    const cacheEntry = evaluate ? this.engineCache.get(baseId) : undefined;

    if (cacheEntry && cacheEntry.rows.length > 0) {
      const filtered = applyFilter(cacheEntry.rows, payload.filter);
      const sorted = applySort(filtered, payload.sort ?? cacheEntry.order);
      const paginated = paginateRows(sorted, payload.limit ?? 50, payload.page ?? 1);
      return {
        total: filtered.length,
        page: paginated.page,
        rows: paginated.rows,
        evaluate: true,
        source: "engine",
      };
    }

    // Fallback: read metadata and frontmatter
    const rows = await this.evaluateFallback(baseId, payload);
    const filtered = applyFilter(rows, payload.filter);
    const sorted = applySort(filtered, payload.sort ?? []);
    const paginated = paginateRows(sorted, payload.limit ?? 50, payload.page ?? 1);
    return {
      total: filtered.length,
      page: paginated.page,
      rows: paginated.rows,
      evaluate: false,
      source: "fallback",
    };
  }

  private async performUpsert(baseId: string, payload: UpsertPayload): Promise<Record<string, unknown>> {
    if (!payload.operations || payload.operations.length === 0) {
      throw new HttpError(400, "operations array required");
    }

    const results: Array<Record<string, unknown>> = [];
    const errors: Array<Record<string, unknown>> = [];

    for (const operation of payload.operations) {
      try {
        const result = await this.applyFrontmatterOperation(operation);
        results.push(result);
      } catch (error) {
        if (payload.continueOnError) {
          errors.push({
            file: operation.file,
            error: (error as Error).message,
          });
        } else {
          throw error;
        }
      }
    }

    return {
      ok: errors.length === 0,
      results,
      errors,
    };
  }

  private async createBaseFile(payload: BaseCreatePayload): Promise<Record<string, unknown>> {
    if (!payload?.path || !payload?.spec) {
      throw new HttpError(400, "path and spec are required");
    }

    const normalizedPath = normalizePath(payload.path);
    const existing = this.app.vault.getAbstractFileByPath(normalizedPath);
    if (existing && !payload.overwrite) {
      throw new HttpError(409, `Base already exists: ${normalizedPath}`);
    }

    const yaml = stringifyYaml(payload.spec ?? {});

    if (payload.validateOnly) {
      // Parsing ensures validity
      parseYaml(yaml);
      return { ok: true, id: normalizedPath, warnings: [] };
    }

    const file = existing instanceof TFile ? existing : await this.app.vault.create(normalizedPath, yaml);
    if (existing instanceof TFile && payload.overwrite) {
      await this.app.vault.modify(file, yaml);
    }

    return { ok: true, id: file.path, warnings: [] };
  }

  private async getBaseConfig(baseId: string): Promise<Record<string, unknown>> {
    const { file, config, yaml } = await this.loadBaseConfig(baseId);
    return {
      id: file.path,
      yaml,
      json: config,
    };
  }

  private async upsertBaseConfig(baseId: string, payload: BaseConfigPayload): Promise<Record<string, unknown>> {
    if (!payload.yaml && !payload.json) {
      throw new HttpError(400, "yaml or json is required");
    }

    const file = this.requireBaseFile(baseId);
    const yaml = payload.yaml ?? stringifyYaml(payload.json ?? {});

    // Validate
    const parsed = parseYaml(yaml) ?? {};

    if (payload.validateOnly) {
      return { ok: true, id: file.path, warnings: [] };
    }

    await this.app.vault.modify(file, yaml);
    return { ok: true, id: file.path, warnings: [] };
  }

  private async loadBaseConfig(baseId: string): Promise<{ file: TFile; config: BaseDefinition; yaml: string }> {
    const file = this.requireBaseFile(baseId);
    const yaml = await this.app.vault.read(file);
    const parsed = (parseYaml(yaml) ?? {}) as BaseDefinition;
    return { file, config: parsed, yaml };
  }

  private requireBaseFile(baseId: string): TFile {
    const normalizedPath = normalizePath(baseId);
    const file = this.app.vault.getAbstractFileByPath(normalizedPath);
    if (!(file instanceof TFile)) {
      throw new HttpError(404, `Base not found: ${baseId}`);
    }
    return file;
  }

  private async evaluateFallback(baseId: string, payload: QueryPayload): Promise<BridgeRow[]> {
    const { config } = await this.loadBaseConfig(baseId);
    const rows: BridgeRow[] = [];

    for (const file of this.app.vault.getFiles()) {
      if (file.extension !== "md") {
        continue;
      }
      const cache = this.app.metadataCache.getFileCache(file);
      const frontmatter = { ...(cache?.frontmatter ?? {}) } as Record<string, unknown>;
      delete (frontmatter as any).position;

      const props = normalizeFrontmatter(frontmatter);
      const computed = {
        "file.path": file.path,
        "file.name": file.name,
        "file.ext": file.extension,
        "file.mtime": file.stat.mtime,
        "file.ctime": file.stat.ctime,
        "file.size": file.stat.size,
      };

      rows.push({
        file: { path: file.path, name: file.name },
        props,
        computed,
      });
    }

    let filteredRows = rows;

    const baseFilter = normalizeBaseFilter(config.filters);
    if (baseFilter) {
      filteredRows = applyFilter(filteredRows, baseFilter);
    }

    if (payload.view && Array.isArray(config.views)) {
      const viewConfig = config.views.find((view: any) => view?.name === payload.view);
      const viewFilter = viewConfig ? normalizeBaseFilter(viewConfig.filters) : undefined;
      if (viewFilter) {
        filteredRows = applyFilter(filteredRows, viewFilter);
      }
    }

    return filteredRows;
  }

  private async applyFrontmatterOperation(operation: UpsertOperation): Promise<Record<string, unknown>> {
    if (!operation.file) {
      throw new HttpError(400, "operation.file is required");
    }

    const normalizedPath = normalizePath(operation.file);
    const file = this.app.vault.getAbstractFileByPath(normalizedPath);
    if (!(file instanceof TFile)) {
      throw new HttpError(404, `File not found: ${operation.file}`);
    }

    if (operation.expected_mtime && file.stat.mtime !== operation.expected_mtime) {
      throw new HttpError(409, `mtime mismatch for ${operation.file}`);
    }

    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      if (operation.unset) {
        for (const key of operation.unset) {
          if (isReservedProperty(key)) {
            throw new HttpError(400, `Cannot unset protected key ${key}`);
          }
          delete frontmatter[key];
        }
      }

      if (operation.set) {
        for (const [key, rawValue] of Object.entries(operation.set)) {
          if (isReservedProperty(key)) {
            throw new HttpError(400, `Cannot set protected key ${key}`);
          }
          frontmatter[key] = normalizeFrontmatterValue(rawValue);
        }
      }
    });

    const stat = await this.app.vault.adapter.stat(file.path);
    return {
      file: file.path,
      mtime: stat?.mtime ?? file.stat.mtime,
      changed: {
        keys: Object.keys(operation.set ?? {}),
        unset: operation.unset ?? [],
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function readBody(req: IncomingMessage): Promise<string> {
  return await new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", (error) => reject(error));
  });
}

function normalizeBaseFilter(filter: unknown): AdditionalFilter | undefined {
  if (filter === null || filter === undefined) {
    return undefined;
  }

  if (typeof filter === "string") {
    return parseFilterExpression(filter);
  }

  if (Array.isArray(filter)) {
    const normalized = filter.map((entry) => normalizeBaseFilter(entry)).filter(Boolean) as AdditionalFilter[];
    if (normalized.length === 0) {
      return undefined;
    }
    if (normalized.length === 1) {
      return normalized[0];
    }
    return { and: normalized };
  }

  if (typeof filter === "object") {
    const record = filter as Record<string, unknown>;
    const normalized: AdditionalFilter = {};

    if (record.eq && typeof record.eq === "object" && !Array.isArray(record.eq)) {
      const eq = normalizeComparisonRecord(record.eq as Record<string, unknown>);
      if (Object.keys(eq).length > 0) {
        normalized.eq = eq;
      }
    }

    if (record.in && typeof record.in === "object" && !Array.isArray(record.in)) {
      const listEntries: Record<string, unknown[]> = {};
      for (const [key, value] of Object.entries(record.in as Record<string, unknown>)) {
        const list = Array.isArray(value)
          ? value.map((item) => coerceFilterScalar(item))
          : typeof value === "string"
            ? parseFilterList(value)
            : [];
        if (list.length > 0) {
          listEntries[key] = list;
        }
      }
      if (Object.keys(listEntries).length > 0) {
        normalized.in = listEntries;
      }
    }

    if (record.regex && typeof record.regex === "object" && !Array.isArray(record.regex)) {
      const regexEntries: Record<string, string> = {};
      for (const [key, value] of Object.entries(record.regex as Record<string, unknown>)) {
        if (typeof value === "string" && value.length > 0) {
          regexEntries[key] = stripQuotes(value);
        }
      }
      if (Object.keys(regexEntries).length > 0) {
        normalized.regex = regexEntries;
      }
    }

    if (record.and !== undefined) {
      const andFilters = normalizeFilterList(record.and);
      if (andFilters.length > 0) {
        normalized.and = andFilters;
      }
    }

    if (record.or !== undefined) {
      const orFilters = normalizeFilterList(record.or);
      if (orFilters.length > 0) {
        normalized.or = orFilters;
      }
    }

    if (record.not !== undefined) {
      const notFilter = normalizeBaseFilter(record.not);
      if (notFilter) {
        normalized.not = notFilter;
      }
    }

    return hasFilterContent(normalized) ? normalized : undefined;
  }

  return undefined;
}

function normalizeFilterList(value: unknown): AdditionalFilter[] {
  const entries = Array.isArray(value) ? value : [value];
  return entries
    .map((entry) => normalizeBaseFilter(entry))
    .filter((entry): entry is AdditionalFilter => Boolean(entry));
}

function normalizeComparisonRecord(value: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (Array.isArray(raw)) {
      result[key] = raw.map((item) => coerceFilterScalar(item));
    } else {
      result[key] = coerceFilterScalar(raw);
    }
  }
  return result;
}

function coerceFilterScalar(value: unknown): unknown {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;
    if (trimmed === "null") return null;
    if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return trimmed.slice(1, -1);
    }
    const numeric = Number(trimmed);
    if (!Number.isNaN(numeric)) {
      return numeric;
    }
    return trimmed;
  }
  return value;
}

function parseFilterExpression(expression: string): AdditionalFilter | undefined {
  const trimmed = expression.trim();
  if (!trimmed) {
    return undefined;
  }

  const notInMatch = trimmed.match(/^([A-Za-z0-9_.-]+)\s+not\s+in\s+(.+)$/i);
  if (notInMatch) {
    const [, key, rawList] = notInMatch;
    const list = parseFilterList(rawList);
    if (list.length === 0) return undefined;
    return { not: { in: { [key]: list } } };
  }

  const inMatch = trimmed.match(/^([A-Za-z0-9_.-]+)\s+in\s+(.+)$/i);
  if (inMatch) {
    const [, key, rawList] = inMatch;
    const list = parseFilterList(rawList);
    if (list.length === 0) return undefined;
    return { in: { [key]: list } };
  }

  const notMatchesMatch = trimmed.match(/^([A-Za-z0-9_.-]+)\s+not\s+matches\s+(.+)$/i);
  if (notMatchesMatch) {
    const [, key, pattern] = notMatchesMatch;
    const regex = stripQuotes(pattern.trim());
    if (!regex) return undefined;
    return { not: { regex: { [key]: regex } } };
  }

  const matchesMatch = trimmed.match(/^([A-Za-z0-9_.-]+)\s+matches\s+(.+)$/i);
  if (matchesMatch) {
    const [, key, pattern] = matchesMatch;
    const regex = stripQuotes(pattern.trim());
    if (!regex) return undefined;
    return { regex: { [key]: regex } };
  }

  const comparisonMatch = trimmed.match(/^([A-Za-z0-9_.-]+)\s*(==|!=|=~|!~)\s*(.+)$/);
  if (comparisonMatch) {
    const [, key, operator, rawValue] = comparisonMatch;
    if (operator === "==") {
      return { eq: { [key]: coerceFilterScalar(rawValue) } };
    }
    if (operator === "!=") {
      return { not: { eq: { [key]: coerceFilterScalar(rawValue) } } };
    }
    if (operator === "=~") {
      const regex = stripQuotes(rawValue.trim());
      if (!regex) return undefined;
      return { regex: { [key]: regex } };
    }
    if (operator === "!~") {
      const regex = stripQuotes(rawValue.trim());
      if (!regex) return undefined;
      return { not: { regex: { [key]: regex } } };
    }
  }

  if (trimmed.startsWith("!")) {
    const nested = parseFilterExpression(trimmed.slice(1));
    return nested ? { not: nested } : undefined;
  }

  if (/^([A-Za-z0-9_.-]+)$/.test(trimmed)) {
    const key = trimmed;
    return { eq: { [key]: true } };
  }

  return undefined;
}

function parseFilterList(raw: string): unknown[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }

  const normalized = trimmed.replace(/^\(|\)$/g, "");
  const bracketed = normalized.startsWith("[") && normalized.endsWith("]");
  const content = bracketed ? normalized.slice(1, -1) : normalized;

  if (bracketed) {
    const jsonCandidate = content.trim();
    if (jsonCandidate) {
      try {
        const parsed = JSON.parse(`[${jsonCandidate.replace(/'/g, '"')}]`);
        if (Array.isArray(parsed)) {
          return parsed.map((entry) => coerceFilterScalar(entry));
        }
      } catch (error) {
        // Fall through to manual parsing
      }
    }
  }

  return content
    .split(/\s*,\s*/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => coerceFilterScalar(item));
}

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function hasFilterContent(filter: AdditionalFilter): boolean {
  return Boolean(
    (filter.eq && Object.keys(filter.eq).length > 0) ||
      (filter.in && Object.keys(filter.in).length > 0) ||
      (filter.regex && Object.keys(filter.regex).length > 0) ||
      (filter.and && filter.and.length > 0) ||
      (filter.or && filter.or.length > 0) ||
      filter.not,
  );
}

function normalizeEngineValue(value: unknown): unknown {
  if (!value) return value;
  if (typeof value === "object" && value !== null) {
    if (typeof (value as any).toString === "function") {
      return (value as any).toString();
    }
  }
  return value;
}

function normalizeFrontmatter(frontmatter: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(frontmatter)) {
    result[key] = normalizeFrontmatterValue(value);
  }
  return result;
}

function normalizeFrontmatterValue(value: unknown): unknown {
  if (typeof value === "string") {
    if (/^#/.test(value)) {
      return [value.replace(/^#/, "")];
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) =>
      typeof item === "string" && item.startsWith("#") ? item.replace(/^#/, "") : item,
    );
  }
  return value;
}

function isReservedProperty(key: string): boolean {
  return key.startsWith("formula.") || key.startsWith("file.");
}

function inferPropertyKind(key: string, value: Record<string, unknown>): string {
  if (key.startsWith("formula.")) return "formula";
  if (key.startsWith("file.")) return "file";
  if (typeof value.kind === "string") return value.kind;
  return "note";
}

function applyFilter(rows: BridgeRow[], filter?: AdditionalFilter): BridgeRow[] {
  if (!filter) return rows;
  return rows.filter((row) => matchFilter(row, filter));
}

function matchFilter(row: BridgeRow, filter: AdditionalFilter): boolean {
  if (filter.eq) {
    for (const [key, expected] of Object.entries(filter.eq)) {
      const value = readRowValue(row, key);
      if (value !== expected) return false;
    }
  }
  if (filter.in) {
    for (const [key, list] of Object.entries(filter.in)) {
      const value = readRowValue(row, key);
      if (!Array.isArray(list) || !list.includes(value as any)) return false;
    }
  }
  if (filter.regex) {
    for (const [key, pattern] of Object.entries(filter.regex)) {
      const value = readRowValue(row, key);
      if (typeof value !== "string" || !new RegExp(pattern).test(value)) {
        return false;
      }
    }
  }
  if (filter.and) {
    if (!filter.and.every((sub) => matchFilter(row, sub))) return false;
  }
  if (filter.or) {
    if (!filter.or.some((sub) => matchFilter(row, sub))) return false;
  }
  if (filter.not) {
    if (matchFilter(row, filter.not)) return false;
  }
  return true;
}

function readRowValue(row: BridgeRow, key: string): unknown {
  if (key.startsWith("file.")) {
    return row.computed[key];
  }
  if (key in row.props) {
    return row.props[key];
  }
  return undefined;
}

function applySort(rows: BridgeRow[], sort: Array<{ prop: string; dir?: SortDirection }> | string[]): BridgeRow[] {
  if (!sort || sort.length === 0) return rows;
  const sortArray = Array.isArray(sort)
    ? sort.map((item) => (typeof item === "string" ? { prop: item, dir: "asc" as SortDirection } : item))
    : [];

  const cloned = [...rows];
  cloned.sort((a, b) => {
    for (const descriptor of sortArray) {
      const dir = descriptor.dir ?? "asc";
      const left = readRowValue(a, descriptor.prop);
      const right = readRowValue(b, descriptor.prop);
      if (left === right) continue;
      if (left == null) return dir === "asc" ? -1 : 1;
      if (right == null) return dir === "asc" ? 1 : -1;
      if (left < right) return dir === "asc" ? -1 : 1;
      if (left > right) return dir === "asc" ? 1 : -1;
    }
    return 0;
  });
  return cloned;
}

function paginateRows(rows: BridgeRow[], limit: number, page: number): { rows: BridgeRow[]; page: number } {
  const safeLimit = Math.min(Math.max(limit, 1), 500);
  const safePage = Math.max(page, 1);
  const offset = (safePage - 1) * safeLimit;
  return {
    rows: rows.slice(offset, offset + safeLimit),
    page: safePage,
  };
}
