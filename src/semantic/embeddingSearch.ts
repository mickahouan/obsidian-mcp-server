import { cosineSimilarity } from "./cosineSimilarity.js";

export interface EmbeddedDocument {
  id: string;
  embedding: number[];
  text?: string;
}

export interface ScoredEmbedding extends EmbeddedDocument {
  score: number;
}

export function embeddingSearch(
  queryEmbedding: number[],
  docs: EmbeddedDocument[],
  topK = 5,
): ScoredEmbedding[] {
  return docs
    .map((d) => ({
      ...d,
      score: cosineSimilarity(queryEmbedding, d.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
