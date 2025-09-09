import path from "node:path";

export function resolveSmartEnvDir(): string | null {
  const p = process.env.SMART_ENV_DIR?.trim();
  if (!p) return null;
  // F:\... (Windows) ou /mnt/f/... (POSIX/WSL)
  return /^[A-Za-z]:\\|^\\\\\?\\/.test(p)
    ? path.win32.normalize(p)
    : path.posix.normalize(p);
}

export function toPosix(p: string): string {
  return p.split("\\").join("/");
}

export function samePathEnd(a: string, b: string): boolean {
  const norm = (p: string) =>
    toPosix(p)
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
  const aa = norm(a);
  const bb = norm(b);
  return aa === bb || aa.endsWith("/" + bb);
}
