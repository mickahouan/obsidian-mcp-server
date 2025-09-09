import { toPosix } from "../../utils/resolveSmartEnvDir.js";

export type PluginSmartInput = {
  query?: string;
  fromPath?: string;
  limit?: number;
};
export type PluginSmartResult = {
  path: string;
  score?: number;
  preview?: string;
};
export type PluginSmartResponse = {
  results: PluginSmartResult[];
};

const PLUGIN_TIMEOUT_MS = 15000;
const PLUGIN_RETRIES = 2;

export async function obsidianPluginSmart(
  input: PluginSmartInput,
): Promise<PluginSmartResponse | null> {
  const base = process.env.OBSIDIAN_BASE_URL;
  const key = process.env.OBSIDIAN_API_KEY;
  if (!base || !key || typeof fetch !== "function") return null;

  const url = `${base.replace(/\/+$/, "")}/search/smart`;
  const payload: any = {
    query: input.query ?? undefined,
    fromPath: input.fromPath ?? undefined,
    limit: input.limit ?? undefined,
  };

  const fetchFn: typeof fetch = fetch;
  let lastErr: any = null;
  for (let attempt = 0; attempt <= PLUGIN_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PLUGIN_TIMEOUT_MS);
    try {
      const res = await fetchFn(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.status === 401 || res.status === 403 || res.status === 404)
        return null;

      if (res.status >= 500 && res.status < 600) {
        if (attempt < PLUGIN_RETRIES) continue;
        throw new Error(`HTTP ${res.status}`);
      }

      if (!res.ok) return null;

      const body = await res.json().catch(() => ({}));
      const raw = Array.isArray(body?.results)
        ? body.results
        : Array.isArray(body)
          ? body
          : [];
      const results = raw
        .map((r: any) => ({
          path: typeof r?.path === "string" ? toPosix(r.path) : null,
          score: typeof r?.score === "number" ? r.score : undefined,
          preview: typeof r?.preview === "string" ? r.preview : undefined,
        }))
        .filter((r: any) => r.path);
      return { results };
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt >= PLUGIN_RETRIES) throw err;
    }
  }
  if (lastErr) throw lastErr;
  return null;
}
