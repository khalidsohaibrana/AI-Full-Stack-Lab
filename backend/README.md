# Backend

Node.js + TypeScript + Express API for the AI Full-Stack Lab.

## Run

From this directory, install dependencies and create the local environment file:

    cp .env.example .env

Set AI_API_KEY, AI_BASE_URL, and an available AI_MODEL in .env, then run:

    npm run dev

The API is available at http://localhost:3001.

The default configuration targets Groq's OpenAI-compatible endpoint. The same client can be pointed at another compatible provider by changing AI_BASE_URL.

If the environment variables are missing, the backend still starts and logs a configuration warning. GET /api/health reports aiConfigured: false, while POST /api/chat returns HTTP 503 with setup instructions.

## Endpoints

GET /api/health returns a basic service health response:

    { "ok": true, "service": "ai-fullstack-lab-backend", "aiConfigured": true }

POST /api/chat accepts the current in-session conversation:

    {
      "messages": [
        { "role": "user", "content": "Explain event loops simply" }
      ]
    }

and returns HTTP 200:

    { "text": "..." }

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
