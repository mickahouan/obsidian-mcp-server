export interface SearchDocument {
  path: string;
  text: string;
}

export interface RankedDocument {
  path: string;
  score: number;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/\s+/).filter(Boolean);
}

export function rankDocumentsTFIDF(
  query: string,
  documents: SearchDocument[],
): RankedDocument[] {
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) {
    return documents.map((d) => ({ path: d.path, score: 0 }));
  }

  const docsTokens = documents.map((d) => ({
    path: d.path,
    tokens: tokenize(d.text),
  }));

  const docCount = documents.length;
  const idf: Record<string, number> = {};
  for (const term of new Set(queryTerms)) {
    let df = 0;
    for (const doc of docsTokens) {
      if (doc.tokens.includes(term)) {
        df += 1;
      }
    }
    idf[term] = Math.log((docCount + 1) / (df + 1)) + 1;
  }

  const scores: RankedDocument[] = [];
  for (const doc of docsTokens) {
    let score = 0;
    for (const term of queryTerms) {
      const termFreq =
        doc.tokens.filter((t) => t === term).length / doc.tokens.length;
      score += termFreq * idf[term];
    }
    scores.push({ path: doc.path, score });
  }

  return scores.sort((a, b) => b.score - a.score);
}
