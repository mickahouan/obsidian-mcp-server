import path from "node:path";

export function resolveSmartEnvDir(): string | null {
  const p = process.env.SMART_ENV_DIR?.trim();
  if (!p) return null;
  // Accept "F:\\...", "\\\\?\\F:\\..." (win) or POSIX "/mnt/f/..."
  const isWin = /^[A-Za-z]:\\|^\\\\\\?\\/.test(p);
  return isWin ? path.win32.normalize(p) : path.posix.normalize(p);
}

// Normalize path separators for display and comparisons
export function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

// Compare paths by suffix, using POSIX separators
export function samePathEnd(a: string, b: string): boolean {
  const aa = toPosix(a);
  const bb = toPosix(b);
  return aa === bb || aa.endsWith("/" + bb);
}
