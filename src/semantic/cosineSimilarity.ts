export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must be of same length");
  }
  let dot = 0;
  let aLen = 0;
  let bLen = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aLen += a[i] * a[i];
    bLen += b[i] * b[i];
  }
  const denominator = Math.sqrt(aLen) * Math.sqrt(bLen);
  return denominator === 0 ? 0 : dot / denominator;
}
