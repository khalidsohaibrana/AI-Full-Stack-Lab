import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig } from "./config.js";

describe("embedding configuration", () => {
  it("keeps embedding settings independent from chat settings", () => {
    const config = loadConfig({
      AI_API_KEY: "chat-key",
      AI_MODEL: "chat-model",
      AI_EMBEDDING_API_KEY: "embedding-key",
      AI_EMBEDDING_BASE_URL: "https://embedding.example/v1",
      AI_EMBEDDING_MODEL: "embedding-model",
      AI_EMBEDDING_DIMENSIONS: "512",
    });

    assert.equal(config.validationErrors.length, 0);
    assert.deepEqual(config.embedding, {
      provider: "openai-compatible",
      apiKey: "embedding-key",
      baseUrl: "https://embedding.example/v1",
      model: "embedding-model",
      dimensions: 512,
      validationErrors: [],
    });
  });

  it("does not make chat configuration invalid when embeddings are not configured", () => {
    const config = loadConfig({
      AI_API_KEY: "chat-key",
      AI_MODEL: "chat-model",
    });

    assert.equal(config.validationErrors.length, 0);
    assert.equal(config.embedding.apiKey, undefined);
    assert.equal(config.embedding.model, undefined);
    assert.deepEqual(config.embedding.validationErrors, []);
  });

  it("reports invalid optional embedding dimensions separately", () => {
    const config = loadConfig({
      AI_API_KEY: "chat-key",
      AI_MODEL: "chat-model",
      AI_EMBEDDING_DIMENSIONS: "not-a-number",
    });

    assert.equal(config.validationErrors.length, 0);
    assert.deepEqual(config.embedding.validationErrors, [
      "AI_EMBEDDING_DIMENSIONS must be a positive integer when provided",
    ]);
  });
});
