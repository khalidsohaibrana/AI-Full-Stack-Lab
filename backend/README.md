# Backend

Node.js + TypeScript + Express API for the AI Full-Stack Lab.

## Run

From this directory, install dependencies and create the local environment file:

    cp .env.example .env

Set the provider, credentials, model, and context policy in .env, then run:

    npm run dev

The API is available at http://localhost:3001.

The default configuration targets Groq's OpenAI-compatible endpoint. The same client can be pointed at another compatible provider by changing AI_PROVIDER, AI_BASE_URL, AI_API_KEY, and AI_MODEL. Context settings are also environment-driven because context limits and output budgets vary by model.

The current context policy is:

    AI_CONTEXT_WINDOW_TOKENS=8000
    AI_MAX_OUTPUT_TOKENS=1000
    AI_CONTEXT_SAFETY_MARGIN_TOKENS=500

Phase 2 adds configurable token estimation:

    AI_TOKEN_ESTIMATOR=character-ratio
    AI_CHARS_PER_TOKEN=4
    AI_MESSAGE_OVERHEAD_TOKENS=4

The available input budget is calculated as:

    context window - maximum output - safety margin

Phase 1 defines the policy and Phase 2 estimates each request through a pure backend module. The character-ratio estimator is intentionally transparent and provider-neutral; it is not exact provider tokenization. Message truncation and summarization will be implemented in later phases.

If the environment variables are missing, the backend still starts and logs a configuration warning. GET /api/health reports aiConfigured: false, while POST /api/chat returns HTTP 503 with setup instructions.

## Endpoints

GET /api/health returns a basic service health response:

    {
      "ok": true,
      "service": "ai-fullstack-lab-backend",
      "provider": "groq",
      "model": "openai/gpt-oss-20b",
      "aiConfigured": true,
      "configValid": true,
      "context": {
        "contextWindowTokens": 8000,
        "maxOutputTokens": 1000,
        "contextSafetyMarginTokens": 500,
        "availableInputTokens": 6500
      }
    }

POST /api/chat accepts the current in-session conversation:

    {
      "messages": [
        { "role": "user", "content": "Explain event loops simply" }
      ]
    }

and returns HTTP 200:

    {
      "text": "...",
      "context": {
        "estimator": "character-ratio",
        "instructionsTokens": 12,
        "messageTokens": 24,
        "estimatedInputTokens": 36,
        "availableInputTokens": 6500,
        "remainingInputTokens": 6464,
        "withinBudget": true
      }
    }

The backend is currently stateless between requests. The client sends the current messages array on every request; the backend does not persist it in a database.

Only user and assistant roles are supported at this stage. Invalid input returns HTTP 400. Missing model configuration returns HTTP 503. Provider failures return HTTP 500.

## Why Express instead of NestJS?

NestJS provides a structured architecture with modules, providers, controllers, and dependency injection. That is valuable for large teams and long-lived services.

This learning project starts with Express because it is minimal and flexible. Fewer abstractions make the HTTP lifecycle, middleware, routing, request validation, model calls, and manual dependency composition visible while we learn how agents actually work.

We can later build a second branch that ports this backend to NestJS and compare the architectures.

## Development checks

From the repository root:

    npm run build

The backend build runs TypeScript compilation and writes generated files to backend/dist. Generated files and node_modules are ignored by Git.
