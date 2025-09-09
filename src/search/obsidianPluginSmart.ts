import type { SmartSearchInput, SmartSearchOutput } from "./smartSearch.js";

// Appelle l'API Smart Connections du plugin Obsidian.
export async function obsidianPluginSmart(
  input: SmartSearchInput,
): Promise<SmartSearchOutput | null> {
  const base = process.env.SMART_CONNECTIONS_API;
  if (!base || typeof fetch !== "function") return null;
  try {
    const url = new URL(base);
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/search`;
    const params = new URLSearchParams();
    if (input.query) params.set("q", input.query);
    if (input.fromPath) params.set("from", input.fromPath);
    if (input.limit) params.set("limit", String(input.limit));
    url.search = params.toString();
    const t0 = Date.now();
    const res = await fetch(url.toString());
    const tookMs = Date.now() - t0;
    if (!res.ok) return null;
    const body = (await res.json().catch(() => ({}))) as any;
    const results = Array.isArray(body?.results)
      ? body.results
          .map((r: any) => ({
            path: String(r.path ?? ""),
            score: Number(r.score ?? 0),
          }))
          .filter((r: any) => r.path)
      : [];
    return {
      method: "plugin",
      results,
      encoder: String(body?.encoder ?? "plugin"),
      dim: Number(body?.dim ?? 0),
      poolSize: Number(body?.poolSize ?? 0),
      tookMs: Number(body?.tookMs ?? tookMs),
    };
  } catch {
    return null;
  }
}
