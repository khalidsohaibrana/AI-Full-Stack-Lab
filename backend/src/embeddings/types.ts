export type EmbeddingInput = string | string[];

export type EmbeddingRequest = {
  input: EmbeddingInput;
};

export type EmbeddingUsage = {
  promptTokens: number;
  totalTokens: number;
};

export type EmbeddingResult = {
  vectors: number[][];
  model: string;
  dimensions: number;
  usage?: EmbeddingUsage;
};

export interface EmbeddingProvider {
  embed(request: EmbeddingRequest): Promise<EmbeddingResult>;
}
