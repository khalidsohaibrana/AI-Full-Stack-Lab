import "dotenv/config";
import cors from "cors";
import express from "express";
import OpenAI from "openai";
import type { ChatMessage } from "./chat/types.js";
import { loadConfig } from "./config.js";
import {
  ContextWindowError,
  prepareContext,
} from "./context/context-manager.js";

const config = loadConfig();
const app = express();
const frontendOrigin = config.frontendOrigin;
const aiApiKey = config.ai.apiKey;
const aiBaseUrl = config.ai.baseUrl;
const aiModel = config.ai.model;

const modelClient = aiApiKey
  ? new OpenAI({
      apiKey: aiApiKey,
      baseURL: aiBaseUrl || undefined,
    })
  : null;

if (config.validationErrors.length > 0) {
  console.warn("Configuration warnings:");
  for (const validationError of config.validationErrors) {
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

app.get("/api/health", (_request, response) => {
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
  });
});

app.post("/api/chat", async (request, response) => {
  const { messages: rawMessages } = request.body as {
    messages?: unknown;
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

  let managedContext;

  try {
    managedContext = prepareContext(
      config.ai.instructions,
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
    const modelResponse = await modelClient.responses.create({
      model: aiModel,
      max_output_tokens: config.ai.maxOutputTokens,
      instructions: config.ai.instructions,
      input: managedContext.messages,
    });

    response.json({
      text: modelResponse.output_text,
      context: {
        ...managedContext.estimate,
        ...managedContext.truncation,
        contextWindowTokens: config.ai.contextWindowTokens,
        maxOutputTokens: config.ai.maxOutputTokens,
        contextSafetyMarginTokens: config.ai.contextSafetyMarginTokens,
      },
    });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "model request failed" });
  }
});

app.listen(config.port, () => {
  console.log(`Backend listening on http://localhost:${config.port}`);
});
