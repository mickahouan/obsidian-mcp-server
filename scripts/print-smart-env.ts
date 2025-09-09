import { loadSmartEnvVectors } from "../src/search/providers/smartEnvFiles.ts";

const vecs = await loadSmartEnvVectors();
console.log("vecCount =", vecs.length);
if (vecs.length)
  console.log(
    "sample =",
    vecs.slice(0, 3).map((v) => ({ path: v.path, dim: v.vec.length })),
  );

