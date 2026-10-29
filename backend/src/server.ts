import "dotenv/config";
import cors from "cors";
import express from "express";
import OpenAI from "openai";
import { Pool } from "pg";
import type { ChatMessage } from "./chat/types.js";
import { loadConfig } from "./config.js";
import {
  ContextWindowError,
  prepareContext,
} from "./context/context-manager.js";
import { createEmbeddingProvider } from "./embeddings/openai-compatible-provider.js";
import {
  MemoryWritingError,
  MemoryWritingService,
} from "./memory/memory-writing-service.js";
import { validateMemoryInput } from "./memory/validation.js";
import { MemoryRetrievalService } from "./retrieval/memory-retrieval-service.js";
import { InMemoryVectorStore } from "./vector-store/in-memory-vector-store.js";
import { PostgresVectorStore } from "./vector-store/postgres-vector-store.js";
import type { VectorStore } from "./vector-store/types.js";

const config = loadConfig();
const app = express();
const frontendOrigin = config.frontendOrigin;
const aiApiKey = config.ai.apiKey;
const aiBaseUrl = config.ai.baseUrl;
const aiModel = config.ai.model;
const embeddingApiKey = config.embedding.apiKey;
const embeddingModel = config.embedding.model;

const modelClient = aiApiKey
  ? new OpenAI({
      apiKey: aiApiKey,
      baseURL: aiBaseUrl || undefined,
    })
  : null;

const embeddingProvider =
  config.embedding.provider === "openai-compatible"
    ? createEmbeddingProvider({
        apiKey: embeddingApiKey ?? "",
        baseUrl: config.embedding.baseUrl,
        model: embeddingModel ?? "",
        dimensions: config.embedding.dimensions,
      })
    : null;
const databasePool =
  config.storage.provider === "postgres" && config.storage.databaseUrl
    ? new Pool({ connectionString: config.storage.databaseUrl })
    : null;
const vectorStore: VectorStore = databasePool
  ? new PostgresVectorStore(databasePool)
  : new InMemoryVectorStore();
const retrievalService = new MemoryRetrievalService(
  embeddingProvider,
  vectorStore,
  config.retrieval,
);
const memoryWritingService = new MemoryWritingService(
  embeddingProvider,
  vectorStore,
);

if (config.validationErrors.length > 0) {
  console.warn("Configuration warnings:");
  for (const validationError of config.validationErrors) {
    console.warn(`- ${validationError}`);
  }
}

if (config.storage.validationErrors.length > 0) {
  console.warn("Memory storage configuration warnings:");
  for (const validationError of config.storage.validationErrors) {
    console.warn(`- ${validationError}`);
  }
}

if (!aiApiKey || !aiModel) {
  console.warn(
    "AI provider is not configured. Add AI_API_KEY and AI_MODEL to backend/.env before using /api/chat.",
  );
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;

  const message = value as Record<string, unknown>;

  return (
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string" &&
    message.content.trim().length > 0
  );
}

app.use(cors({ origin: frontendOrigin }));
app.use(express.json());

app.get("/api/health", async (_request, response) => {
  response.json({
    ok: true,
    service: "ai-fullstack-lab-backend",
    provider: config.ai.provider,
    model: aiModel ?? null,
    aiConfigured: Boolean(modelClient && aiModel),
    configValid: config.validationErrors.length === 0,
    context: {
      contextWindowTokens: config.ai.contextWindowTokens,
      maxOutputTokens: config.ai.maxOutputTokens,
      contextSafetyMarginTokens: config.ai.contextSafetyMarginTokens,
      availableInputTokens: config.ai.availableInputTokens,
      tokenEstimator: config.ai.tokenEstimator.strategy,
      truncationStrategy: config.ai.contextTruncationStrategy,
      oversizedMessagePolicy: config.ai.oversizedMessagePolicy,
    },
    embedding: {
      provider: config.embedding.provider,
      model: embeddingModel ?? null,
      dimensions: config.embedding.dimensions ?? null,
      configured: Boolean(embeddingApiKey && embeddingModel),
      configValid: config.embedding.validationErrors.length === 0,
    },
    retrieval: {
      enabled: config.retrieval.enabled,
      topK: config.retrieval.topK,
      minSimilarity: config.retrieval.minSimilarity,
      minImportance: config.retrieval.minImportance,
      defaultUserId: config.retrieval.defaultUserId,
      configValid: config.retrieval.validationErrors.length === 0,
    storage: {
      provider: config.storage.provider,
      configured: Boolean(databasePool || config.storage.provider === "in-memory"),
      configValid: config.storage.validationErrors.length === 0,
      validationErrors: config.storage.validationErrors,
      storedMemories: await vectorStore.size(),
    },
    },
  });
});

app.post("/api/memories", async (request, response) => {
  if (config.storage.validationErrors.length > 0) {
    response.status(503).json({
      error: "Memory storage configuration is invalid.",
      details: config.storage.validationErrors,
    });
    return;
  }

  const body = request.body as Record<string, unknown>;
  const userId =
    typeof body.userId === "string" && body.userId.trim().length > 0
      ? body.userId.trim()
      : config.retrieval.defaultUserId;
  const input = { ...body, userId };
  const validationErrors = validateMemoryInput(input);

  if (validationErrors.length > 0) {
    response.status(400).json({
      error: "memory input is invalid",
      details: validationErrors,
    });
    return;
  }

  try {
    const memory = await memoryWritingService.write(input);
    response.status(201).json({ memory });
  } catch (error) {
    if (error instanceof MemoryWritingError) {
      const status =
        error.code === "invalid_input"
          ? 400
          : error.code === "embedding_not_configured"
            ? 503
            : 502;
      response.status(status).json({
        error: error.message,
        code: error.code,
        ...(error.details.length > 0 ? { details: error.details } : {}),
      });
      return;
    }

    console.error(error);
    response.status(500).json({ error: "memory write failed" });
  }
});

app.post("/api/chat", async (request, response) => {
  const { messages: rawMessages, userId: rawUserId } = request.body as {
    messages?: unknown;
    userId?: unknown;
  };

  if (
    !Array.isArray(rawMessages) ||
    rawMessages.length === 0 ||
    !rawMessages.every(isChatMessage)
  ) {
    response.status(400).json({
      error:
        "messages must be a non-empty array containing user or assistant messages with non-empty content",
    });
    return;
  }

  if (!modelClient || !aiModel) {
    response.status(503).json({
      error:
        "AI provider is not configured. Set AI_API_KEY and AI_MODEL in backend/.env, then restart the backend.",
    });
    return;
  }

  if (config.validationErrors.length > 0) {
    response.status(503).json({
      error: "AI configuration is invalid.",
      details: config.validationErrors,
    });
    return;
  }

  if (config.retrieval.validationErrors.length > 0) {
    response.status(503).json({
      error: "Memory retrieval configuration is invalid.",
      details: config.retrieval.validationErrors,
    });
    return;
  }

  if (config.storage.validationErrors.length > 0) {
    response.status(503).json({
      error: "Memory storage configuration is invalid.",
      details: config.storage.validationErrors,
    });
    return;
  }

  const userId =
    typeof rawUserId === "string" && rawUserId.trim().length > 0
      ? rawUserId.trim()
      : config.retrieval.defaultUserId;
  const latestUserMessage = [...rawMessages]
    .reverse()
    .find((message) => message.role === "user");
  let retrieval;

  try {
    retrieval = await retrievalService.retrieve(
      userId,
      latestUserMessage?.content ?? "",
    );
  } catch (error) {
    console.error(error);
    response.status(502).json({ error: "memory retrieval failed" });
    return;
  }
  const instructions = retrieval.context
    ? `${config.ai.instructions}\n\n${retrieval.context}`
    : config.ai.instructions;

  let managedContext;

  try {
    managedContext = prepareContext(
      instructions,
      rawMessages,
      config.ai.tokenEstimator,
      config.ai.availableInputTokens,
      {
        strategy: config.ai.contextTruncationStrategy,
        oversizedMessagePolicy: config.ai.oversizedMessagePolicy,
      },
    );
  } catch (error) {
    if (error instanceof ContextWindowError) {
      response.status(
        error.code === "instructions_too_large" ? 503 : 400,
      ).json({
        error: "context window limit cannot accommodate this request",
        code: error.code,
        details: error.message,
      });
      return;
    }

    throw error;
  }

  try {
    const modelResponse = await modelClient.chat.completions.create({
      model: aiModel,
      max_tokens: config.ai.maxOutputTokens,
      messages: [
        { role: "system", content: instructions },
        ...managedContext.messages,
      ],
    });

    response.json({
      text: modelResponse.choices[0]?.message.content ?? "",
      context: {
        ...managedContext.estimate,
        ...managedContext.truncation,
        contextWindowTokens: config.ai.contextWindowTokens,
        maxOutputTokens: config.ai.maxOutputTokens,
        contextSafetyMarginTokens: config.ai.contextSafetyMarginTokens,
      },
      retrieval: retrieval.metadata,
    });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "model request failed" });
  }
});

app.listen(config.port, () => {
  console.log(`Backend listening on http://localhost:${config.port}`);
});
