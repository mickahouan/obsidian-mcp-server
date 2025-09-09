import OpenAI from "openai";
import {
  embeddingSearch,
  EmbeddedDocument,
  ScoredEmbedding,
} from "./embeddingSearch";

export interface Result {
  id: string;
  text: string;
  score: number;
}

export type Embedder = (input: string) => Promise<number[]>;

export class SemanticService {
  private documents: EmbeddedDocument[] = [];
  constructor(private embedder: Embedder) {}

  static withOpenAI(
    apiKey: string,
    model = "text-embedding-3-small",
  ): SemanticService {
    const client = new OpenAI({ apiKey });
    const embedder: Embedder = async (input: string) => {
      const res = await client.embeddings.create({ model, input });
      return res.data[0].embedding;
    };
    return new SemanticService(embedder);
  }

  async index(docs: { id: string; text: string }[]): Promise<void> {
    this.documents = [];
    for (const doc of docs) {
      const embedding = await this.embedder(doc.text);
      this.documents.push({ id: doc.id, text: doc.text, embedding });
    }
  }

  async search(query: string, topK = 5): Promise<Result[]> {
    const queryEmbedding = await this.embedder(query);
    const scored: ScoredEmbedding[] = embeddingSearch(
      queryEmbedding,
      this.documents,
      topK,
    );
    return scored.map((d) => ({
      id: d.id,
      text: d.text ?? "",
      score: d.score,
    }));
  }
}
