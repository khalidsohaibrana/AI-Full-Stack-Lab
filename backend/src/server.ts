import "dotenv/config";
import cors from "cors";
import express from "express";
import OpenAI from "openai";

const app = express();
const port = Number(process.env.PORT ?? 3001);
const frontendOrigin = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";
const apiKey = process.env.OPENAI_API_KEY?.trim();
const model = process.env.OPENAI_MODEL?.trim();

const openai = apiKey ? new OpenAI({ apiKey }) : null;

if (!apiKey || !model) {
  console.warn(
    "AI provider is not configured. Add OPENAI_API_KEY and OPENAI_MODEL to backend/.env before using /api/chat.",
  );
}

app.use(cors({ origin: frontendOrigin }));
app.use(express.json());

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    service: "ai-fullstack-lab-backend",
    aiConfigured: Boolean(openai && model),
  });
});

app.post("/api/chat", async (request, response) => {
  const { message } = request.body as { message?: unknown };

  if (typeof message !== "string" || message.trim().length === 0) {
    response.status(400).json({
      error: "message must be a non-empty string",
    });
    return;
  }

  if (!openai || !model) {
    response.status(503).json({
      error:
        "AI provider is not configured. Set OPENAI_API_KEY and OPENAI_MODEL in backend/.env, then restart the backend.",
    });
    return;
  }

  try {
    const modelResponse = await openai.responses.create({
      model,
      instructions: "You are a helpful assistant. Answer clearly and concisely.",
      input: message,
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
