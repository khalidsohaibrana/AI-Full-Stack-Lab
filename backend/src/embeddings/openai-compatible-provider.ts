import OpenAI from "openai";
import type {
  EmbeddingProvider,
  EmbeddingRequest,
  EmbeddingResult,
} from "./types.js";

export type OpenAICompatibleEmbeddingConfig = {
  apiKey: string;
  baseUrl?: string;
  model: string;
  dimensions?: number;
};

type EmbeddingApiRequest = {
  model: string;
  input: string | string[];
  encoding_format: "float";
  dimensions?: number;
};

type EmbeddingApiResponse = {
  data: Array<{ embedding: number[] | string }>;
  model: string;
  usage?: {
    prompt_tokens: number;
    total_tokens: number;
  };
};

export type EmbeddingsApi = {
  create(request: EmbeddingApiRequest): Promise<EmbeddingApiResponse>;
};

export class EmbeddingProviderError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "invalid_input"
      | "invalid_response",
  ) {
    super(message);
    this.name = "EmbeddingProviderError";
  }
}

export class OpenAICompatibleEmbeddingProvider
  implements EmbeddingProvider
{
  constructor(
    private readonly config: OpenAICompatibleEmbeddingConfig,
    private readonly embeddingsApi: EmbeddingsApi = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    }).embeddings,
  ) {}

  async embed(request: EmbeddingRequest): Promise<EmbeddingResult> {
    this.validateInput(request.input);

    const response = await this.embeddingsApi.create({
      model: this.config.model,
      input: request.input,
      encoding_format: "float",
      ...(this.config.dimensions
        ? { dimensions: this.config.dimensions }
        : {}),
    });

    const vectors = response.data.map((item) => {
      if (
        typeof item.embedding === "string" ||
        !item.embedding.every((value) => Number.isFinite(value))
      ) {
        throw new EmbeddingProviderError(
          "Embedding provider returned a non-numeric vector.",
          "invalid_response",
        );
      }

      return item.embedding;
    });

    const dimensions = vectors[0]?.length ?? 0;
    if (vectors.some((vector) => vector.length !== dimensions)) {
      throw new EmbeddingProviderError(
        "Embedding provider returned vectors with inconsistent dimensions.",
        "invalid_response",
      );
    }

    return {
      vectors,
      model: response.model,
      dimensions,
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined,
    };
  }

  private validateInput(input: EmbeddingRequest["input"]): void {
    const values = typeof input === "string" ? [input] : input;

    if (
      values.length === 0 ||
      values.some((value) => typeof value !== "string" || value.trim() === "")
    ) {
      throw new EmbeddingProviderError(
        "Embedding input must contain at least one non-empty string.",
        "invalid_input",
      );
    }
  }
}

export function createEmbeddingProvider(
  config: OpenAICompatibleEmbeddingConfig | undefined,
): EmbeddingProvider | null {
  if (!config?.apiKey || !config.model) return null;
  return new OpenAICompatibleEmbeddingProvider(config);
}
