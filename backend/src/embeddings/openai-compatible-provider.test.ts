import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EmbeddingProviderError,
  OpenAICompatibleEmbeddingProvider,
  type EmbeddingsApi,
} from "./openai-compatible-provider.js";

function fakeApi(response: Awaited<ReturnType<EmbeddingsApi["create"]>>): {
  api: EmbeddingsApi;
  calls: Parameters<EmbeddingsApi["create"]>[];
} {
  const calls: Parameters<EmbeddingsApi["create"]>[] = [];
  return {
    calls,
    api: {
      create: async (request) => {
        calls.push([request]);
        return response;
      },
    },
  };
}

describe("OpenAICompatibleEmbeddingProvider", () => {
  it("maps a single embedding response and forwards model settings", async () => {
    const { api, calls } = fakeApi({
      data: [{ embedding: [0.1, 0.2, 0.3] }],
      model: "text-embedding-3-small",
      usage: { prompt_tokens: 4, total_tokens: 4 },
    });
    const provider = new OpenAICompatibleEmbeddingProvider(
      {
        apiKey: "test-key",
        model: "text-embedding-3-small",
        dimensions: 3,
      },
      api,
    );

    const result = await provider.embed({ input: "TypeScript" });

    assert.deepEqual(result, {
      vectors: [[0.1, 0.2, 0.3]],
      model: "text-embedding-3-small",
      dimensions: 3,
      usage: { promptTokens: 4, totalTokens: 4 },
    });
    assert.deepEqual(calls[0]?.[0], {
      model: "text-embedding-3-small",
      input: "TypeScript",
      encoding_format: "float",
      dimensions: 3,
    });
  });

  it("supports batch input", async () => {
    const { api } = fakeApi({
      data: [{ embedding: [1, 0] }, { embedding: [0, 1] }],
      model: "embedding-model",
    });
    const provider = new OpenAICompatibleEmbeddingProvider(
      { apiKey: "test-key", model: "embedding-model" },
      api,
    );

    const result = await provider.embed({ input: ["first", "second"] });

    assert.deepEqual(result.vectors, [
      [1, 0],
      [0, 1],
    ]);
    assert.equal(result.dimensions, 2);
  });

  it("rejects empty input before making a provider request", async () => {
    let called = false;
    const api: EmbeddingsApi = {
      create: async () => {
        called = true;
        return { data: [], model: "embedding-model" };
      },
    };
    const provider = new OpenAICompatibleEmbeddingProvider(
      { apiKey: "test-key", model: "embedding-model" },
      api,
    );

    await assert.rejects(
      provider.embed({ input: ["valid", "   "] }),
      (error: unknown) =>
        error instanceof EmbeddingProviderError &&
        error.code === "invalid_input",
    );
    assert.equal(called, false);
  });

  it("rejects non-numeric provider vectors", async () => {
    const { api } = fakeApi({
      data: [{ embedding: "not-a-vector" }],
      model: "embedding-model",
    });
    const provider = new OpenAICompatibleEmbeddingProvider(
      { apiKey: "test-key", model: "embedding-model" },
      api,
    );

    await assert.rejects(
      provider.embed({ input: "hello" }),
      (error: unknown) =>
        error instanceof EmbeddingProviderError &&
        error.code === "invalid_response",
    );
  });
});
