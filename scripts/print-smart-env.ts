import { loadSmartEnvVectors } from "../src/search/providers/smartEnvFiles.js";

const vecs = await loadSmartEnvVectors();
console.error("vecCount =", vecs.length);
if (vecs.length)
  console.error(
    "sample =",
    vecs.slice(0, 3).map((v) => ({ path: v.path, dim: v.vec.length })),
  );
