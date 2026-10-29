import "dotenv/config";
import cors from "cors";
import express from "express";
import OpenAI from "openai";
import { Pool } from "pg";
import type { ChatMessage } from "./chat/types.js";
import { InMemoryChatHistoryStore } from "./chat-history/in-memory-chat-history-store.js";
import { PostgresChatHistoryStore } from "./chat-history/postgres-chat-history-store.js";
import type { ChatHistoryStore } from "./chat-history/types.js";
import { AgentLoopError, runAgent } from "./agent/agent-loop.js";
import { completeWithOpenAICompatibleProvider } from "./agent/openai-compatible-agent.js";
import type { AgentMessage } from "./agent/types.js";
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
import { learningTools } from "./tools/learning-tools.js";
import { ToolRegistry } from "./tools/tool-registry.js";
import { createExternalTools } from "./tools/external-tools.js";

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
const chatHistoryStore: ChatHistoryStore = databasePool
  ? new PostgresChatHistoryStore(databasePool)
  : new InMemoryChatHistoryStore();
const retrievalService = new MemoryRetrievalService(
  embeddingProvider,
  vectorStore,
  config.retrieval,
);
const memoryWritingService = new MemoryWritingService(
  embeddingProvider,
  vectorStore,
);
const toolRegistry = new ToolRegistry();

for (const tool of learningTools) {
  toolRegistry.register(tool);
}

for (const tool of createExternalTools(config.external)) {
  toolRegistry.register(tool);
}

toolRegistry.register({
  name: "search_memory",
  description: "Search the user's long-term semantic memory for a relevant fact.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "The fact to search for." },
    },
    required: ["query"],
    additionalProperties: false,
  },
  async execute(argumentsValue, context) {
    if (!argumentsValue || typeof argumentsValue !== "object") {
      throw new Error("search_memory arguments must be an object.");
    }

    const query = (argumentsValue as Record<string, unknown>).query;
    if (typeof query !== "string" || query.trim().length === 0) {
      throw new Error("search_memory requires a non-empty query.");
    }

    const result = await retrievalService.retrieve(context.userId, query);
    return {
      matches: result.memories.map(({ memory, similarity }) => ({
        content: memory.content,
        type: memory.type,
        importance: memory.importance,
        similarity,
      })),
    };
  },
});

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

function isCurrentLocation(value: unknown): value is {
  latitude: number;
  longitude: number;
} {
  if (!value || typeof value !== "object") return false;
  const location = value as Record<string, unknown>;
  return (
    typeof location.latitude === "number" &&
    Number.isFinite(location.latitude) &&
    location.latitude >= -90 &&
    location.latitude <= 90 &&
    typeof location.longitude === "number" &&
    Number.isFinite(location.longitude) &&
    location.longitude >= -180 &&
    location.longitude <= 180
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
    agent: {
      maxIterations: config.agent.maxIterations,
      maxToolCalls: config.agent.maxToolCalls,
      toolTimeoutMs: config.agent.toolTimeoutMs,
      maxToolResultChars: config.agent.maxToolResultChars,
      tools: toolRegistry.listDefinitions().map((tool) => tool.name),
    },
    externalTools: {
      geocodingBaseUrl: config.external.geocodingBaseUrl,
      weatherBaseUrl: config.external.weatherBaseUrl,
      routingBaseUrl: config.external.routingBaseUrl,
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
      chatHistory: databasePool ? "postgres" : "in-memory",
    },
    },
  });
});

app.post("/api/conversations", async (request, response) => {
  const body = request.body as Record<string, unknown>;
  const userId =
    typeof body.userId === "string" && body.userId.trim().length > 0
      ? body.userId.trim()
      : config.retrieval.defaultUserId;
  const title = typeof body.title === "string" ? body.title : undefined;

  try {
    const conversation = await chatHistoryStore.createConversation(userId, title);
    response.status(201).json({ conversation });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "conversation could not be created" });
  }
});

app.get("/api/conversations", async (request, response) => {
  const rawUserId = request.query.userId;
  const userId =
    typeof rawUserId === "string" && rawUserId.trim().length > 0
      ? rawUserId.trim()
      : config.retrieval.defaultUserId;

  try {
    const conversations = await chatHistoryStore.listConversations(userId);
    response.json({ userId, count: conversations.length, conversations });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "conversation history could not be loaded" });
  }
});

app.get("/api/conversations/:conversationId/messages", async (request, response) => {
  const rawUserId = request.query.userId;
  const userId =
    typeof rawUserId === "string" && rawUserId.trim().length > 0
      ? rawUserId.trim()
      : config.retrieval.defaultUserId;

  try {
    const conversation = await chatHistoryStore.getConversation(
      request.params.conversationId,
      userId,
    );
    if (!conversation) {
      response.status(404).json({ error: "conversation not found" });
      return;
    }
    const messages = await chatHistoryStore.listMessages(conversation.id, userId);
    response.json({ conversation, messages });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "conversation messages could not be loaded" });
  }
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

app.get("/api/memories", async (request, response) => {
  const rawUserId = request.query.userId;
  const userId =
    typeof rawUserId === "string" && rawUserId.trim().length > 0
      ? rawUserId.trim()
      : config.retrieval.defaultUserId;

  try {
    const memories = await vectorStore.list(userId);
    response.json({ userId, count: memories.length, memories });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "memory listing failed" });
  }
});

app.post("/api/chat", async (request, response) => {
  const { messages: rawMessages, userId: rawUserId, conversationId } = request.body as {
    messages?: unknown;
    userId?: unknown;
    conversationId?: unknown;
    currentLocation?: unknown;
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

  const rawCurrentLocation = (request.body as Record<string, unknown>).currentLocation;
  if (
    rawCurrentLocation !== undefined &&
    rawCurrentLocation !== null &&
    !isCurrentLocation(rawCurrentLocation)
  ) {
    response.status(400).json({
      error: "currentLocation must contain valid latitude and longitude values",
    });
    return;
  }
  const currentLocation = isCurrentLocation(rawCurrentLocation)
    ? rawCurrentLocation
    : undefined;

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
  if (
    conversationId !== undefined &&
    conversationId !== null &&
    typeof conversationId !== "string"
  ) {
    response.status(400).json({ error: "conversationId must be a string when provided" });
    return;
  }
  let activeConversationId = conversationId;
  if (activeConversationId) {
    const conversation = await chatHistoryStore.getConversation(
      activeConversationId,
      userId,
    );
    if (!conversation) {
      response.status(404).json({ error: "conversation not found" });
      return;
    }
  } else {
    activeConversationId = undefined;
  }
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
  const toolDefinitions = toolRegistry.listDefinitions();
  const toolSummary = toolDefinitions
    .map((tool) => `- ${tool.name}: ${tool.description}`)
    .join("\n");
  const agentInstructions = `${instructions}\n\nAvailable tools:\n${toolSummary}\nUse a tool when it is useful for the user's request. If no tool is needed, answer directly. Preserve locations explicitly provided by the user. Use current location only when the user explicitly asks for it.`;

  let managedContext;

  try {
    managedContext = prepareContext(
      agentInstructions,
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
    const agentResult = await runAgent({
      messages: [
        { role: "system", content: agentInstructions },
        ...managedContext.messages,
      ] as AgentMessage[],
      tools: toolDefinitions,
      complete: (agentRequest) =>
        completeWithOpenAICompatibleProvider(
          modelClient,
          aiModel,
          config.ai.maxOutputTokens,
          agentRequest,
        ),
      execute: async (call) => {
        const result = await toolRegistry.execute(
          call.name,
          call.arguments,
          { userId, currentLocation },
          config.agent.toolTimeoutMs,
        );
        const serialized = JSON.stringify(result.output) ?? String(result.output);
        if (serialized.length > config.agent.maxToolResultChars) {
          return {
            ...result,
            toolCallId: call.id,
            output: {
              error: `Tool result exceeded the ${config.agent.maxToolResultChars}-character limit.`,
            },
            isError: true,
          };
        }

        return { ...result, toolCallId: call.id };
      },
      maxIterations: config.agent.maxIterations,
      maxToolCalls: config.agent.maxToolCalls,
    });

    if (!activeConversationId) {
      const conversation = await chatHistoryStore.createConversation(userId);
      activeConversationId = conversation.id;
    }
    if (latestUserMessage) {
      await chatHistoryStore.appendTurn(
        activeConversationId,
        userId,
        latestUserMessage.content,
        agentResult.text,
      );
    }

    response.json({
      text: agentResult.text,
      conversationId: activeConversationId,
      context: {
        ...managedContext.estimate,
        ...managedContext.truncation,
        contextWindowTokens: config.ai.contextWindowTokens,
        maxOutputTokens: config.ai.maxOutputTokens,
        contextSafetyMarginTokens: config.ai.contextSafetyMarginTokens,
      },
      retrieval: retrieval.metadata,
      agent: {
        iterations: agentResult.iterations,
        events: agentResult.events,
        toolCalls: agentResult.events.filter((event) => event.type === "tool_selected").length,
      },
    });
  } catch (error) {
    if (error instanceof AgentLoopError) {
      response.status(502).json({
        error: error.message,
        code: error.code,
      });
      return;
    }

    console.error(error);
    response.status(502).json({ error: "agent request failed" });
  }
});

app.listen(config.port, () => {
  console.log(`Backend listening on http://localhost:${config.port}`);
});
