import { pipeline } from "@xenova/transformers";

type EmbedFunction = (text: string) => Promise<number[]>;

const pickModel = (hint?: string, dimension?: number): string => {
  const normalisedHint = hint?.toLowerCase() ?? "";

  if (normalisedHint.includes("bge") && normalisedHint.includes("384")) {
    return "Xenova/bge-small-en-v1.5";
  }

  if (dimension === 384) {
    return "Xenova/bge-small-en-v1.5";
  }

  if (dimension === 768 || normalisedHint.includes("bge-base")) {
    return "Xenova/bge-base-en-v1.5";
  }

  if (dimension === 1024 || normalisedHint.includes("bge-m3")) {
    return "Xenova/bge-m3";
  }

  return "Xenova/bge-small-en-v1.5";
};

let cachedModel: string | null = null;
let cachedEmbedder: EmbedFunction | null = null;

export const getEmbedder = async (
  modelHint?: string,
  dimension?: number,
): Promise<EmbedFunction> => {
  const model = pickModel(modelHint, dimension);

  if (!cachedEmbedder || cachedModel !== model) {
    const featureExtractor = await pipeline("feature-extraction", model);
    cachedModel = model;
    cachedEmbedder = async (text: string) => {
      const output = await featureExtractor(text, {
        pooling: "mean",
        normalize: true,
      });

      return Array.from(output.data as Float32Array);
    };
  }

  return cachedEmbedder;
};

