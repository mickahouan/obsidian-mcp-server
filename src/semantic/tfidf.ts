import { cosineSimilarity } from "./cosineSimilarity";

export interface TfIdfDoc {
  id: string;
  text: string;
}

export interface ScoredDoc {
  id: string;
  score: number;
}

export class TfIdf {
  private tokens: Map<string, string[]> = new Map();
  private idf: Map<string, number> = new Map();

  constructor(docs: TfIdfDoc[]) {
    const df: Map<string, number> = new Map();
    for (const doc of docs) {
      const tok = this.tokenize(doc.text);
      this.tokens.set(doc.id, tok);
      const unique = new Set(tok);
      for (const term of unique) {
        df.set(term, (df.get(term) ?? 0) + 1);
      }
    }
    const docCount = docs.length;
    df.forEach((v, term) => {
      this.idf.set(term, Math.log(docCount / (1 + v)));
    });
  }

  private tokenize(text: string): string[] {
    return text.toLowerCase().split(/\W+/).filter(Boolean);
  }

  private vector(tokens: string[]): number[] {
    const terms = Array.from(this.idf.keys());
    const tf: Map<string, number> = new Map();
    for (const t of tokens) {
      tf.set(t, (tf.get(t) ?? 0) + 1);
    }
    return terms.map((term) => (tf.get(term) ?? 0) * (this.idf.get(term) ?? 0));
  }

  public search(query: string): ScoredDoc[] {
    const queryVec = this.vector(this.tokenize(query));
    const results: ScoredDoc[] = [];
    for (const [id, tok] of this.tokens.entries()) {
      const docVec = this.vector(tok);
      results.push({ id, score: cosineSimilarity(queryVec, docVec) });
    }
    return results.sort((a, b) => b.score - a.score);
  }
}
