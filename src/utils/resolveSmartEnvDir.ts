import path from "node:path";

export function resolveSmartEnvDir(): string | null {
  const p = process.env.SMART_ENV_DIR?.trim();
  if (!p) return null;
  const win = /^([A-Za-z]:\\|\\\\\?\\)/.test(p);
  return win ? path.win32.normalize(p) : path.posix.normalize(p);
}
