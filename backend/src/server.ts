import "dotenv/config";
import cors from "cors";
import express from "express";
import OpenAI from "openai";

const app = express();
const port = Number(process.env.PORT ?? 3001);
const frontendOrigin = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";
const aiApiKey = process.env.AI_API_KEY?.trim();
const aiBaseUrl = process.env.AI_BASE_URL?.trim();
const aiModel = process.env.AI_MODEL?.trim();

const modelClient = aiApiKey
  ? new OpenAI({
      apiKey: aiApiKey,
      baseURL: aiBaseUrl || undefined,
    })
  : null;

if (!aiApiKey || !aiModel) {
  console.warn(
    "AI provider is not configured. Add AI_API_KEY and AI_MODEL to backend/.env before using /api/chat.",
  );
}

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

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
    aiConfigured: Boolean(modelClient && aiModel),
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

  try {
    const modelResponse = await modelClient.responses.create({
      model: aiModel,
      instructions: "You are a helpful assistant. Answer clearly and concisely.",
      input: rawMessages,
    });

    response.json({ text: modelResponse.output_text });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "model request failed" });
  }
});

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
