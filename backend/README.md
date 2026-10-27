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
    AI_CONTEXT_TRUNCATION_STRATEGY=recent-turns
    AI_OVERSIZED_MESSAGE_POLICY=reject

The available input budget is calculated as:

    context window - maximum output - safety margin

Phase 1 defines the policy, Phase 2 estimates each request through a pure backend module, and Phase 3 applies recent complete-turn truncation. The character-ratio estimator is intentionally transparent and provider-neutral; it is not exact provider tokenization. The truncation strategy and oversized-message policy are configurable for future providers and models. Summarization will be implemented in a later phase.

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
        "availableInputTokens": 6500,
        "tokenEstimator": "character-ratio",
        "truncationStrategy": "recent-turns",
        "oversizedMessagePolicy": "reject"
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
        "withinBudget": true,
        "wasTruncated": false,
        "receivedMessages": 1,
        "sentMessages": 1,
        "droppedMessages": 0,
        "droppedTokens": 0
      }
    }

When the conversation exceeds the configured input budget, the backend removes the oldest complete turns first. It preserves the newest user turn and never sends a partial user/assistant turn. If the newest individual message cannot fit, it returns HTTP 400 with a context-window error instead of calling the provider.

The backend is currently stateless between requests. The client sends the current messages array on every request; the backend does not persist it in a database.

Only user and assistant roles are supported at this stage. Invalid input returns HTTP 400. Missing model configuration returns HTTP 503. Provider failures return HTTP 500.

## Why Express instead of NestJS?

NestJS provides a structured architecture with modules, providers, controllers, and dependency injection. That is valuable for large teams and long-lived services.

This learning project starts with Express because it is minimal and flexible. Fewer abstractions make the HTTP lifecycle, middleware, routing, request validation, model calls, and manual dependency composition visible while we learn how agents actually work.

We can later build a second branch that ports this backend to NestJS and compare the architectures.

## Development checks

From the repository root:

    npm run build
    npm test

The backend build runs TypeScript compilation and writes generated files to backend/dist. The test command runs the context-manager tests with Node's built-in test runner through tsx. Generated files and node_modules are ignored by Git.
