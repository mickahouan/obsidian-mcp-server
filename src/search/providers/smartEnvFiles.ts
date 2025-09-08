import { resolveSmartEnvDir } from "../../utils/resolveSmartEnvDir.js";

export interface NeighborResult {
  path: string;
  score: number;
}

export async function neighborsFromSmartEnv(
  fromPath: string,
  limit = 10,
): Promise<NeighborResult[]> {
  const root = resolveSmartEnvDir();
  if (!root) throw new Error("SMART_ENV_DIR not set");
  // TODO: localiser le mapping note -> voisins dans root/multi/**/*
  // Si non trouvable, renvoyer [] pour déclencher fallback lexical
  return [];
}
