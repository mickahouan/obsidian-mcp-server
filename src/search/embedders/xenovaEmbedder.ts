// Determine if the Xenova embedder should be enabled based on environment variables
export const xenovaEnabled =
  process.env.ENABLE_QUERY_EMBEDDING === "true" &&
  (process.env.QUERY_EMBEDDER ?? "xenova").toLowerCase() === "xenova";

const MAX_CONCURRENCY = Number(process.env.EMBED_MAX_CONCURRENCY ?? "1");
const TIMEOUT_MS = Number(process.env.EMBED_TIMEOUT_MS ?? "20000");

let _pipePromise: Promise<any> | null = null;
let inflight = 0;
const queue: (() => void)[] = [];

async function getPipe(): Promise<any> {
  if (!_pipePromise) {
    _pipePromise = (async () => {
      const t: any = await import("@xenova/transformers");
      return t.pipeline("feature-extraction", "TaylorAI/bge-micro-v2");
    })();
  }
  return _pipePromise;
}

function withLimit<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      inflight++;
      fn()
        .then(resolve)
        .catch(reject)
        .finally(() => {
          inflight--;
          queue.shift()?.();
        });
    };
    if (inflight < MAX_CONCURRENCY) run();
    else queue.push(run);
  });
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("Embedding timeout")), ms);
    p.then((v) => {
      clearTimeout(id);
      resolve(v);
    }).catch((err) => {
      clearTimeout(id);
      reject(err);
    });
  });
}

export async function embedQuery(q: string): Promise<number[]> {
  return withLimit(async () => {
    const pipe = await getPipe();
    const result = await withTimeout(
      pipe(q, { pooling: "mean", normalize: true }) as Promise<any>,
      TIMEOUT_MS,
    );
    const arr = Array.from(result?.data ?? result ?? []);
    return arr as number[];
  });
}

export async function warmup(): Promise<void> {
  try {
    await embedQuery("warmup");
  } catch {
    // Ignorer les erreurs de warmup
  }
}
