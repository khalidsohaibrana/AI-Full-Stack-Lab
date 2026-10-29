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
import { createGroundedWeatherResponse, isWeatherOnlyRequest, isWeatherRequest } from "./tools/weather-response.js";
import { enforceSearchEvidence, isLiveSearchRequest, type WebSearchEvidence } from "./tools/web-search-guard.js";
import { createPlan } from "./planning/planner.js";
import { executePlan } from "./planning/plan-executor.js";
import type { AgentRunResult } from "./agent/types.js";
import type { PlanExecutionResult } from "./planning/types.js";
import { runParallelOrchestrator } from "./multi-agent/orchestrator.js";
import type { ParallelOrchestrationResult } from "./multi-agent/orchestrator.js";
import { runHandoffOrchestrator } from "./multi-agent/handoff-orchestrator.js";
import type { HandoffOrchestrationResult } from "./multi-agent/handoff-orchestrator.js";
import { runSupervisorOrchestrator } from "./multi-agent/supervisor-orchestrator.js";
import type { SupervisorOrchestrationResult } from "./multi-agent/supervisor-orchestrator.js";

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
    planning: config.planning,
    multiAgent: config.multiAgent,
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
  const { messages: rawMessages, userId: rawUserId, conversationId, planning: rawPlanning, parallel: rawParallel, handoff: rawHandoff, supervisor: rawSupervisor, stream: rawStream } = request.body as {
    messages?: unknown;
    userId?: unknown;
    conversationId?: unknown;
    planning?: unknown;
    parallel?: unknown;
    handoff?: unknown;
    supervisor?: unknown;
    stream?: unknown;
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
  if (rawPlanning !== undefined && typeof rawPlanning !== "boolean") {
    response.status(400).json({ error: "planning must be a boolean when provided" });
    return;
  }
  if (rawParallel !== undefined && typeof rawParallel !== "boolean") {
    response.status(400).json({ error: "parallel must be a boolean when provided" });
    return;
  }
  if (rawHandoff !== undefined && typeof rawHandoff !== "boolean") {
    response.status(400).json({ error: "handoff must be a boolean when provided" });
    return;
  }
  if (rawSupervisor !== undefined && typeof rawSupervisor !== "boolean") {
    response.status(400).json({ error: "supervisor must be a boolean when provided" });
    return;
  }
  if (rawStream !== undefined && typeof rawStream !== "boolean") {
    response.status(400).json({ error: "stream must be a boolean when provided" });
    return;
  }
  const planningEnabled = rawPlanning === true || (config.planning.enabled && rawPlanning !== false);
  const parallelEnabled = rawParallel === true;
  const handoffEnabled = rawHandoff === true;
  const supervisorEnabled = rawSupervisor === true;
  if ([planningEnabled, parallelEnabled, handoffEnabled, supervisorEnabled].filter(Boolean).length > 1) {
    response.status(400).json({ error: "planning, parallel, handoff, and supervisor modes cannot be enabled together" });
    return;
  }
  const streamEnabled = rawStream === true;
  if (streamEnabled) {
    response.status(200);
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders();
  }
  const emitProgress = (event: Record<string, unknown>) => {
    if (!streamEnabled || response.writableEnded) return;
    response.write(`event: progress\ndata: ${JSON.stringify(event)}\n\n`);
  };
  const endStreamWithError = (error: string, code?: string) => {
    if (!streamEnabled || response.writableEnded) return false;
    response.write(`event: error\ndata: ${JSON.stringify({ error, code })}\n\n`);
    response.end();
    return true;
  };
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
    emitProgress({ type: "memory_retrieval_started" });
    retrieval = await retrievalService.retrieve(
      userId,
      latestUserMessage?.content ?? "",
    );
  } catch (error) {
    console.error(error);
    if (endStreamWithError("memory retrieval failed")) return;
    response.status(502).json({ error: "memory retrieval failed" });
    return;
  }
  emitProgress({ type: "memory_retrieval_finished", resultCount: retrieval.metadata.resultCount });
  const instructions = retrieval.context
    ? `${config.ai.instructions}\n\n${retrieval.context}`
    : config.ai.instructions;
  const toolDefinitions = toolRegistry.listDefinitions();
  const toolSummary = toolDefinitions
    .map((tool) => `- ${tool.name}: ${tool.description}`)
    .join("\n");
  const agentInstructions = `${instructions}\n\nAvailable tools:\n${toolSummary}\nUse a tool when it is useful for the user's request. If no tool is needed, answer directly. For current, live, recent, marketplace, price, listing, availability, or explicit web-search requests, you MUST call web_search before answering. When web_search returns results, cite only URLs present in those results; never invent URLs, listings, prices, or unrelated generic recommendations. If no verified results are returned, say that clearly. Never claim access to a capability that is not listed as an available tool. If the user asks whether an unavailable capability exists, answer directly that it is unavailable in this application; do not invent a tool call. Preserve locations explicitly provided by the user. Use current location only when the user explicitly asks for it. Treat tool output as authoritative evidence. For weather, use the normalized fields when present: weatherDescription, currentPrecipitationMm, precipitationProbabilityPercent, rainExpected, and umbrellaRecommended. Never invent a precipitation percentage or claim rain when those fields say otherwise. Only provide umbrella advice when the user asks about umbrellas, rain, or precipitation.`;
  const liveSearchRequested = isLiveSearchRequest(latestUserMessage?.content ?? "");
  let runtimeAgentInstructions = agentInstructions;
  let preflightSearchOutputs: unknown[] = [];
  if (liveSearchRequested) {
    emitProgress({ type: "web_search_started" });
    const preflight = await toolRegistry.execute(
      "web_search",
      { query: latestUserMessage?.content ?? "", maxResults: 10 },
      { userId, currentLocation },
      config.agent.toolTimeoutMs,
    );
    if (!preflight.isError) {
      preflightSearchOutputs = [preflight.output];
      runtimeAgentInstructions += `\n\nMandatory live-search evidence for this request:\n${JSON.stringify(preflight.output)}\nUse only these results and URLs. If the result list is empty, state that no verified live results were found.`;
    }
    emitProgress({ type: "web_search_finished", resultCount: !preflight.isError && preflight.output && typeof preflight.output === "object" && Array.isArray((preflight.output as Record<string, unknown>).results) ? (preflight.output as { results: unknown[] }).results.length : 0 });
  }

  let managedContext;

  try {
    managedContext = prepareContext(
      runtimeAgentInstructions,
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

  const executeTool = async (call: { id: string; name: string; arguments: unknown }) => {
    const result = await toolRegistry.execute(
      call.name,
      call.arguments,
      {
        userId,
        conversationId:
          typeof activeConversationId === "string" ? activeConversationId : undefined,
        currentLocation,
      },
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
  };

  try {
    let agentResult: AgentRunResult;
    let planResult: PlanExecutionResult | null = null;
    let parallelResult: ParallelOrchestrationResult | null = null;
    let handoffResult: HandoffOrchestrationResult | null = null;
    let supervisorResult: SupervisorOrchestrationResult | null = null;

    const completeModel = (agentRequest: Parameters<typeof completeWithOpenAICompatibleProvider>[3]) =>
      completeWithOpenAICompatibleProvider(
        modelClient,
        aiModel,
        config.ai.maxOutputTokens,
        agentRequest,
      );

    if (supervisorEnabled) {
      emitProgress({ type: "supervisor_orchestration_started" });
      supervisorResult = await runSupervisorOrchestrator({
        complete: completeModel,
        userRequest: latestUserMessage?.content ?? "",
        baseMessages: managedContext.messages as AgentMessage[],
        instructions: runtimeAgentInstructions,
        tools: toolDefinitions,
        execute: executeTool,
        maxIterations: config.agent.maxIterations,
        maxToolCalls: config.agent.maxToolCalls,
        maxRetries: 1,
        maxAgents: config.multiAgent.maxAgents,
        onProgress: (event) => emitProgress(event as unknown as Record<string, unknown>),
      });
      agentResult = { text: supervisorResult.text, messages: [], events: [{ type: "started" }, { type: "finished", iterations: 1 }], iterations: 1 };
    } else if (handoffEnabled) {
      emitProgress({ type: "handoff_orchestration_started" });
      handoffResult = await runHandoffOrchestrator({
        complete: completeModel,
        userRequest: latestUserMessage?.content ?? "",
        baseMessages: managedContext.messages as AgentMessage[],
        instructions: runtimeAgentInstructions,
        tools: toolDefinitions,
        execute: executeTool,
        maxIterations: config.agent.maxIterations,
        maxToolCalls: config.agent.maxToolCalls,
        onProgress: (event) => emitProgress(event as unknown as Record<string, unknown>),
      });
      agentResult = {
        text: handoffResult.text,
        messages: [],
        events: [{ type: "started" }, { type: "finished", iterations: 1 }],
        iterations: 1,
      };
    } else if (parallelEnabled) {
      emitProgress({ type: "parallel_orchestration_started" });
      parallelResult = await runParallelOrchestrator({
        complete: completeModel,
        userRequest: latestUserMessage?.content ?? "",
        baseMessages: managedContext.messages as AgentMessage[],
        instructions: runtimeAgentInstructions,
        tools: toolDefinitions,
        execute: executeTool,
        maxIterations: config.agent.maxIterations,
        maxToolCalls: config.agent.maxToolCalls,
        maxAgents: config.multiAgent.maxAgents,
        maxConcurrency: config.multiAgent.maxConcurrency,
        maxGenerationAttempts: config.multiAgent.maxGenerationAttempts,
        onProgress: (event) => emitProgress(event as unknown as Record<string, unknown>),
      });
      agentResult = {
        text: parallelResult.text,
        messages: [],
        events: [{ type: "started" }, { type: "finished", iterations: 1 }],
        iterations: 1,
      };
    } else if (planningEnabled) {
      emitProgress({ type: "planning_started" });
      const plan = await createPlan({
        client: modelClient,
        model: aiModel,
        maxOutputTokens: config.ai.maxOutputTokens,
        userRequest: latestUserMessage?.content ?? "",
        tools: toolDefinitions,
        maxSteps: config.planning.maxSteps,
        maxGenerationAttempts: config.planning.maxGenerationAttempts,
      });
      planResult = await executePlan({
        plan,
        execute: executeTool,
        maxStepRetries: config.planning.maxStepRetries,
        maxReplans: config.planning.maxReplans,
        replan: async (failedPlan, error, results) => createPlan({
          client: modelClient,
          model: aiModel,
          maxOutputTokens: config.ai.maxOutputTokens,
          userRequest: latestUserMessage?.content ?? "",
          tools: toolDefinitions,
          maxSteps: config.planning.maxSteps,
          maxGenerationAttempts: config.planning.maxGenerationAttempts,
          replanningContext: JSON.stringify({ failedPlan, error, results }),
        }),
      });
      emitProgress({ type: "planning_finished", stepCount: planResult.plan.steps.length });
      const planSummary = JSON.stringify({
        goal: planResult.plan.goal,
        steps: planResult.plan.steps,
        results: planResult.results.map(({ step, result }) => ({ step: step.description, output: result.output })),
      });
      const finalResponse = await completeWithOpenAICompatibleProvider(
        modelClient,
        aiModel,
        config.ai.maxOutputTokens,
        {
          messages: [
            { role: "system", content: `${runtimeAgentInstructions}\nYou are now summarizing a completed execution plan. Answer only what the original user requested; do not volunteer unrelated recommendations or advice. Treat tool output as authoritative evidence. Do not invent facts or reinterpret numeric fields when a normalized field is available. For weather, use normalized.rainExpected, normalized.precipitationProbabilityPercent, normalized.currentPrecipitationMm, and normalized.weatherDescription. Translate internal field names into natural language; never expose property paths such as normalized.rainExpected to the user. Mention umbrella guidance only when the original user explicitly asks about rain, precipitation, or carrying an umbrella. Do not mention hidden reasoning.` },
            { role: "user", content: `Original request: ${latestUserMessage?.content ?? ""}\nExecution data: ${planSummary}` },
          ],
          tools: [],
        },
      );
      if (finalResponse.kind !== "final") throw new AgentLoopError("The planning summary requested an unexpected tool call.", "invalid_model_response");
      agentResult = {
        text: finalResponse.text,
        messages: [],
        events: [{ type: "started" }, { type: "finished", iterations: 1 }],
        iterations: 1,
      };
    } else {
      agentResult = await runAgent({
      messages: [
        { role: "system", content: runtimeAgentInstructions },
        ...managedContext.messages,
      ] as AgentMessage[],
      tools: toolDefinitions,
        complete: completeModel,
      execute: executeTool,
      maxIterations: config.agent.maxIterations,
      maxToolCalls: config.agent.maxToolCalls,
      onEvent: (event) => emitProgress({ type: "agent_event", event }),
      });
    }

    const executionOutputs = [...preflightSearchOutputs, ...(planningEnabled
      ? planResult?.results.map(({ result }) => result.output) ?? []
      : parallelEnabled
        ? parallelResult?.results.flatMap((result) => result.status === "fulfilled"
            ? result.value.events
                .flatMap((event) =>
                  event.type === "tool_completed" && !event.isError ? [event.output] : [],
                )
            : []) ?? []
        : handoffEnabled
          ? handoffResult?.workers.flatMap((worker) => worker.result.events
              .flatMap((event) =>
                event.type === "tool_completed" && !event.isError ? [event.output] : [],
              )) ?? []
          : supervisorEnabled
            ? supervisorResult?.results.flatMap((result) => result.status === "completed"
                ? result.value.events.flatMap((event) => event.type === "tool_completed" && !event.isError ? [event.output] : [])
                : []) ?? []
            : agentResult.events
          .flatMap((event) =>
            event.type === "tool_completed" && !event.isError ? [event.output] : [],
          ))];
    const webSearchEvidence = executionOutputs.filter((output): output is WebSearchEvidence =>
      Boolean(output && typeof output === "object" && Array.isArray((output as Record<string, unknown>).results) && (output as Record<string, unknown>).provider),
    );
    if (liveSearchRequested) {
      agentResult = {
        ...agentResult,
        text: enforceSearchEvidence(latestUserMessage?.content ?? "", agentResult.text, webSearchEvidence),
      };
    }
    if (isWeatherRequest(latestUserMessage?.content ?? "")) {
      const groundedWeatherResponse = createGroundedWeatherResponse(
        latestUserMessage?.content ?? "",
        executionOutputs,
      );
      if (!groundedWeatherResponse) {
        throw new AgentLoopError(
          "Weather data could not be retrieved, so I cannot give a reliable weather answer.",
          "missing_weather_evidence",
        );
      }
      if (isWeatherOnlyRequest(latestUserMessage?.content ?? "")) {
        agentResult = { ...agentResult, text: groundedWeatherResponse };
      }
    }

    emitProgress({ type: "final_answer_started" });

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

    const payload = {
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
      planning: planResult
        ? {
            enabled: true,
            goal: planResult.plan.goal,
            steps: planResult.plan.steps,
            events: planResult.events,
            replans: planResult.replans,
          }
        : { enabled: false },
      parallel: parallelResult
        ? {
            enabled: true,
            tasks: parallelResult.tasks,
            workers: parallelResult.results.map((result) => ({
              id: result.id,
              status: result.status,
              objective: parallelResult.tasks.find((task) => task.id === result.id)?.objective,
              iterations: result.status === "fulfilled" ? result.value.iterations : 0,
              toolCalls: result.status === "fulfilled"
                ? result.value.events.filter((event) => event.type === "tool_selected").length
                : 0,
              tools: result.status === "fulfilled"
                ? result.value.events
                    .filter((event) => event.type === "tool_selected")
                    .flatMap((event) => event.type === "tool_selected" ? [event.name] : [])
                : [],
              error: result.status === "rejected" ? result.error : undefined,
            })),
          }
        : { enabled: false },
      handoff: handoffResult
        ? {
            enabled: true,
            handoffs: handoffResult.handoffs,
            workers: handoffResult.workers.map((worker) => ({
              id: worker.id,
              handoffId: worker.handoff.id,
              status: "fulfilled",
              iterations: worker.result.iterations,
              toolCalls: worker.result.events.filter((event) => event.type === "tool_selected").length,
              tools: worker.result.events
                .filter((event) => event.type === "tool_selected")
                .flatMap((event) => event.type === "tool_selected" ? [event.name] : []),
            })),
          }
        : { enabled: false },
      supervisor: supervisorResult
        ? {
            enabled: true,
            tasks: supervisorResult.tasks,
            events: supervisorResult.events,
            workers: supervisorResult.results.map((result) => ({
              id: result.task.id,
              status: result.status,
              attempts: result.attempts.length,
              toolCalls: result.status === "completed" ? result.value.events.filter((event) => event.type === "tool_selected").length : 0,
              error: result.status === "escalated" ? result.error : undefined,
            })),
          }
        : { enabled: false },
    };
    if (streamEnabled) {
      response.write(`event: complete\ndata: ${JSON.stringify(payload)}\n\n`);
      response.end();
    } else {
      response.json(payload);
    }
  } catch (error) {
    if (error instanceof AgentLoopError) {
      if (endStreamWithError(error.message, error.code)) return;
      response.status(502).json({
        error: error.message,
        code: error.code,
      });
      return;
    }

    console.error(error);
    if (endStreamWithError(error instanceof Error ? error.message : "agent request failed", "agent_request_failed")) return;
    response.status(502).json({
      error: error instanceof Error ? error.message : "agent request failed",
      code: "agent_request_failed",
    });
  }
});

app.listen(config.port, () => {
  console.log(`Backend listening on http://localhost:${config.port}`);
});
